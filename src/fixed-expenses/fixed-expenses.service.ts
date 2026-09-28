import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';
import { OccurrencesService, RuleSnapshot } from './occurrences.service';
import { monthKeyOf, toDateOnly } from './occurrence-utils';
import { assertOwnedRefs } from '../common/assert-owned-refs';

const pad2 = (n: number): string => String(n).padStart(2, '0');

@Injectable()
export class FixedExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: OccurrencesService,
  ) {}

  // Criar grava a regra; as ocorrencias (mes corrente ate +12, sem backfill) sao
  // materializadas por OccurrencesService (somente com FIXED_EXPENSES_AUTOGEN=true).
  async create(userId: string, dto: CreateFixedExpenseDto) {
    const startDate = toDateOnly(dto.startDate);
    const endDate = dto.endDate ? toDateOnly(dto.endDate) : null;
    this.assertWindow(startDate, endDate);
    await this.assertOwnedRefs(userId, dto.tagId, dto.creditorId);

    const created = await this.prisma.fixedExpense.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        dayOfMonth: dto.dayOfMonth,
        startDate,
        endDate,
        tagId: dto.tagId ?? null,
        creditorId: dto.creditorId ?? null,
        userId,
      },
      include: { tag: true, creditor: true },
    });

    this.occurrences.invalidate(userId);
    await this.occurrences.ensureSafe(userId, created.id);
    return created;
  }

  findAll(userId: string) {
    return this.prisma.fixedExpense.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { tag: true, creditor: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateFixedExpenseDto) {
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
    await this.assertOwnedRefs(userId, dto.tagId, dto.creditorId);

    // Whitelist explicita: nunca repassa o dto direto ao Prisma.
    const data: Prisma.FixedExpenseUncheckedUpdateManyInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.dayOfMonth !== undefined) data.dayOfMonth = dto.dayOfMonth;
    if (dto.startDate !== undefined) data.startDate = startDate;
    if (dto.endDate !== undefined) data.endDate = endDate;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.tagId !== undefined) data.tagId = dto.tagId;
    if (dto.creditorId !== undefined) data.creditorId = dto.creditorId;

    const { count } = await this.prisma.fixedExpense.updateMany({
      where: { id, userId },
      data,
    });
    if (count === 0) this.notFound();

    if (this.occurrences.enabled(userId)) {
      const next: RuleSnapshot = {
        id,
        name: dto.name ?? current.name,
        amount: dto.amount ?? current.amount,
        dayOfMonth: dto.dayOfMonth ?? current.dayOfMonth,
        tagId: dto.tagId === undefined ? current.tagId : dto.tagId,
        creditorId:
          dto.creditorId === undefined ? current.creditorId : dto.creditorId,
      };
      await this.propagate(userId, current, next, {
        isActive: dto.isActive ?? current.isActive,
        startDate,
        endDate,
      });
    }

    this.occurrences.invalidate(userId);
    await this.occurrences.ensureSafe(userId, id);

    return this.prisma.fixedExpense.findFirstOrThrow({
      where: { id, userId },
      include: { tag: true, creditor: true },
    });
  }

  // Propaga a edicao da regra somente para ocorrencias INTOCADAS (nao pagas e identicas
  // aos valores anteriores da regra), do mes corrente em diante. Nunca legadas/manuais.
  private async propagate(
    userId: string,
    prev: RuleSnapshot,
    next: RuleSnapshot,
    state: { isActive: boolean; startDate: Date; endDate: Date | null },
  ) {
    const changed =
      prev.name !== next.name ||
      Number(prev.amount) !== Number(next.amount) ||
      prev.dayOfMonth !== next.dayOfMonth ||
      prev.tagId !== next.tagId ||
      prev.creditorId !== next.creditorId;
    if (changed) await this.occurrences.updateUntouched(userId, prev, next);

    if (!state.isActive) {
      // Pausada: remove intocadas nao pagas (>= mes corrente, inclui o corrente); reativar recria via ensure.
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
    // $transaction na forma array: tudo ou nada.
    const cleanup = this.occurrences.enabled(userId)
      ? this.occurrences.untouchedDeleteOps(userId, record)
      : [];
    await this.prisma.$transaction([
      ...cleanup,
      this.prisma.fixedExpense.deleteMany({ where: { id, userId } }),
    ]);
    return record;
  }

  // DEPRECADO: mantido so por compatibilidade com front em cache. Idempotente, sem uso na UI.
  async generateForMonth(userId: string, year: number, month: number) {
    this.assertGenerateTarget(year, month);

    // Chave de seguranca (FIXED_EXPENSES_AUTOGEN): desligada => o endpoint deprecado nao escreve nada
    // (evita que um front antigo em cache escreva em producao antes da liberacao do rollout).
    if (!this.occurrences.enabled(userId)) {
      return { generated: 0, skipped: 0, expenses: [] };
    }

    const competence = `${year}-${pad2(month)}`;
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const nextMonthStart = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const rules = await this.prisma.fixedExpense.findMany({
      where: { userId, isActive: true },
    });
    const eligible = rules.filter(
      (fe) =>
        monthKeyOf(fe.startDate) <= competence &&
        (!fe.endDate || monthKeyOf(fe.endDate) >= competence),
    );

    const created: object[] = [];
    let skipped = 0;

    for (const fe of eligible) {
      // Competencia excluida pelo usuario (lapide): nao ressuscita.
      if ((fe.skippedCompetences ?? []).includes(competence)) {
        skipped++;
        continue;
      }
      // Fatura legada (sem competencia) ja existente no mes -> nao duplica.
      const legacy = await this.prisma.expense.findFirst({
        where: {
          userId,
          fixedExpenseId: fe.id,
          fixedExpenseCompetence: null,
          date: { gte: monthStart, lt: nextMonthStart },
        },
        select: { id: true },
      });
      if (legacy) {
        skipped++;
        continue;
      }

      try {
        const expense = await this.prisma.expense.create({
          data: {
            item: fe.name,
            amount: fe.amount,
            date: new Date(
              Date.UTC(year, month - 1, Math.min(fe.dayOfMonth, lastDay)),
            ),
            tagId: fe.tagId,
            creditorId: fe.creditorId,
            userId,
            isPaid: false,
            fixedExpenseId: fe.id,
            fixedExpenseCompetence: competence,
          },
        });
        created.push(expense);
      } catch (e) {
        // Unicidade (fixedExpenseId, competencia) garantida no banco.
        if ((e as { code?: string }).code === 'P2002') {
          skipped++;
          continue;
        }
        throw e;
      }
    }

    return { generated: created.length, skipped, expenses: created };
  }

  private assertWindow(startDate: Date, endDate: Date | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'A data de fim deve ser igual ou posterior a data de inicio.',
      );
    }
  }

  private assertGenerateTarget(year: number, month: number) {
    const currentYear = new Date().getUTCFullYear();
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Mes invalido: use um valor de 1 a 12.');
    }
    if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) {
      throw new BadRequestException(
        `Ano invalido: use um valor entre 2000 e ${currentYear + 1}.`,
      );
    }
  }

  // tagId/creditorId precisam pertencer ao usuario autenticado (helper compartilhado).
  private assertOwnedRefs(
    userId: string,
    tagId?: string | null,
    creditorId?: string | null,
  ) {
    return assertOwnedRefs(this.prisma, userId, { tagId, creditorId });
  }

  private notFound(): never {
    throw new NotFoundException('Despesa fixa nao encontrada.');
  }

  private async findOneOrFail(userId: string, id: string) {
    const record = await this.prisma.fixedExpense.findFirst({
      where: { id, userId },
    });
    if (!record) this.notFound();
    return record;
  }
}
