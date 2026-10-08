import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedIncomeDto } from './dto/create-fixed-income.dto';
import { UpdateFixedIncomeDto } from './dto/update-fixed-income.dto';
import {
  IncomeOccurrencesService,
  IncomeRuleSnapshot,
} from './income-occurrences.service';
import { AmountAdjustment } from './amount-schedule';
import { monthKeyOf, toDateOnly } from '../fixed-expenses/occurrence-utils';
import { assertOwnedRefs } from '../common/assert-owned-refs';

const INCLUDE = {
  tag: true,
  adjustments: { orderBy: { effectiveFrom: 'asc' } },
} satisfies Prisma.FixedIncomeInclude;

@Injectable()
export class FixedIncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: IncomeOccurrencesService,
  ) {}

  // Criar grava a regra; as ocorrencias (mes corrente ate +12, sem backfill) sao
  // materializadas por IncomeOccurrencesService.
  async create(userId: string, dto: CreateFixedIncomeDto) {
    const startDate = toDateOnly(dto.startDate);
    const endDate = dto.endDate ? toDateOnly(dto.endDate) : null;
    this.assertWindow(startDate, endDate);
    await assertOwnedRefs(this.prisma, userId, { tagId: dto.tagId });

    const created = await this.prisma.fixedIncome.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        dayOfMonth: dto.dayOfMonth,
        startDate,
        endDate,
        tagId: dto.tagId ?? null,
        userId,
      },
      include: INCLUDE,
    });

    this.occurrences.invalidate(userId);
    await this.occurrences.ensureSafe(userId, created.id);
    return created;
  }

  findAll(userId: string) {
    return this.prisma.fixedIncome.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: INCLUDE,
    });
  }

  async update(userId: string, id: string, dto: UpdateFixedIncomeDto) {
    const current = await this.findOneOrFail(userId, id);

    const startDate =
      dto.startDate !== undefined
        ? toDateOnly(dto.startDate)
        : current.startDate;
    const endDate =
      dto.endDate === undefined
        ? current.endDate
        : dto.endDate === null
          ? null
          : toDateOnly(dto.endDate);
    this.assertWindow(startDate, endDate);
    if (dto.amountEffectiveFrom !== undefined && dto.amount === undefined) {
      throw new BadRequestException(
        'Informe o novo valor junto com o mes de inicio do reajuste.',
      );
    }
    await assertOwnedRefs(this.prisma, userId, { tagId: dto.tagId });

    // Whitelist explicita: nunca repassa o dto direto ao Prisma.
    const data: Prisma.FixedIncomeUncheckedUpdateManyInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.dayOfMonth !== undefined) data.dayOfMonth = dto.dayOfMonth;
    if (dto.startDate !== undefined) data.startDate = startDate;
    if (dto.endDate !== undefined) data.endDate = endDate;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.tagId !== undefined) data.tagId = dto.tagId;

    // Valor: sem vigencia (ou vigencia <= inicio) corrige a base e zera o historico;
    // com vigencia, grava um reajuste que vale dali em diante (substitui os posteriores).
    let adjustments: AmountAdjustment[] = current.adjustments;
    const adjustmentOps: Prisma.PrismaPromise<unknown>[] = [];
    if (dto.amount !== undefined) {
      const eff = dto.amountEffectiveFrom;
      if (!eff || eff <= monthKeyOf(startDate)) {
        data.amount = dto.amount;
        adjustments = [];
        adjustmentOps.push(
          this.prisma.fixedIncomeAdjustment.deleteMany({
            where: { fixedIncomeId: id },
          }),
        );
      } else {
        adjustments = [
          ...current.adjustments.filter((a) => a.effectiveFrom < eff),
          { effectiveFrom: eff, amount: dto.amount },
        ];
        adjustmentOps.push(
          this.prisma.fixedIncomeAdjustment.deleteMany({
            where: { fixedIncomeId: id, effectiveFrom: { gte: eff } },
          }),
          this.prisma.fixedIncomeAdjustment.create({
            data: { fixedIncomeId: id, effectiveFrom: eff, amount: dto.amount },
          }),
        );
      }
    }

    const [{ count }] = await this.prisma.$transaction([
      this.prisma.fixedIncome.updateMany({ where: { id, userId }, data }),
      ...adjustmentOps,
    ]);
    if (count === 0) this.notFound();

    if (this.occurrences.enabled(userId)) {
      const next: IncomeRuleSnapshot = {
        id,
        name: dto.name ?? current.name,
        amount: (data.amount as number | undefined) ?? current.amount,
        adjustments,
        dayOfMonth: dto.dayOfMonth ?? current.dayOfMonth,
        tagId: dto.tagId === undefined ? current.tagId : dto.tagId,
      };
      await this.propagate(userId, current, next, {
        isActive: dto.isActive ?? current.isActive,
        startDate,
        endDate,
      });
    }

    this.occurrences.invalidate(userId);
    await this.occurrences.ensureSafe(userId, id);

    return this.prisma.fixedIncome.findFirstOrThrow({
      where: { id, userId },
      include: INCLUDE,
    });
  }

  // Propaga a edicao somente para ocorrencias INTOCADAS (identicas ao que a regra anterior
  // produzia), do mes corrente em diante. Meses passados e lancamentos editados nao mudam.
  private async propagate(
    userId: string,
    prev: IncomeRuleSnapshot,
    next: IncomeRuleSnapshot,
    state: { isActive: boolean; startDate: Date; endDate: Date | null },
  ) {
    await this.occurrences.updateUntouched(userId, prev, next);

    if (!state.isActive) {
      await this.occurrences.removeUntouched(
        userId,
        next,
        this.occurrences.futureComps(true),
      );
      return;
    }

    const startKey = monthKeyOf(state.startDate);
    const endKey = state.endDate ? monthKeyOf(state.endDate) : null;
    const outside = this.occurrences
      .futureComps(true)
      .filter((c) => c < startKey || (endKey !== null && c > endKey));
    if (outside.length > 0) {
      await this.occurrences.removeUntouched(userId, next, outside);
    }
  }

  async remove(userId: string, id: string) {
    const record = await this.findOneOrFail(userId, id);
    this.occurrences.invalidate(userId);

    // Limpeza das intocadas (>= mes corrente) ANTES do delete (FK e SetNull; sem isso ficariam orfas).
    const cleanup = this.occurrences.enabled(userId)
      ? this.occurrences.untouchedDeleteOps(userId, record)
      : [];
    await this.prisma.$transaction([
      ...cleanup,
      this.prisma.fixedIncome.deleteMany({ where: { id, userId } }),
    ]);
    return record;
  }

  private assertWindow(startDate: Date, endDate: Date | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'A data de fim deve ser igual ou posterior a data de inicio.',
      );
    }
  }

  private notFound(): never {
    throw new NotFoundException('Receita fixa nao encontrada.');
  }

  private async findOneOrFail(userId: string, id: string) {
    const record = await this.prisma.fixedIncome.findFirst({
      where: { id, userId },
      include: INCLUDE,
    });
    if (!record) this.notFound();
    return record;
  }
}
