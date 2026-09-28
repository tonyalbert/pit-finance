import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateInstallmentsDto } from './dto/create-installments.dto';
import { randomUUID } from 'crypto';
import { OccurrencesService } from '../fixed-expenses/occurrences.service';
import { assertOwnedRefs } from '../common/assert-owned-refs';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: OccurrencesService,
  ) {}

  async create(userId: string, dto: CreateExpenseDto) {
    await assertOwnedRefs(this.prisma, userId, dto);
    return this.prisma.expense.create({
      data: {
        item: dto.item,
        amount: dto.amount,
        date: new Date(dto.date),
        tagId: dto.tagId ?? null,
        isPaid: dto.isPaid ?? false,
        userId,
        installmentGroupId: dto.installmentGroupId ?? null,
        installmentNumber: dto.installmentNumber ?? null,
        installmentTotal: dto.installmentTotal ?? null,
        creditorId: dto.creditorId ?? null,
      },
    });
  }

  async findAll(userId: string) {
    // Self-healing: garante as ocorrencias faltantes das despesas fixas (nunca quebra a listagem).
    await this.occurrences.ensureSafe(userId);
    return this.prisma.expense.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!expense) {
      throw new NotFoundException('Despesa nao encontrada.');
    }

    await assertOwnedRefs(this.prisma, userId, dto);

    // Mutacao escopada por userId na propria query (whitelist explicita dos campos editaveis).
    const { count } = await this.prisma.expense.updateMany({
      where: { id: expense.id, userId },
      data: {
        item: dto.item,
        amount: dto.amount,
        date: dto.date ? new Date(dto.date) : undefined,
        tagId: dto.tagId,
        isPaid: dto.isPaid,
        creditorId: dto.creditorId,
      },
    });
    if (count === 0) {
      throw new NotFoundException('Despesa nao encontrada.');
    }
    return this.prisma.expense.findFirstOrThrow({
      where: { id: expense.id, userId },
    });
  }

  async remove(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!expense) {
      throw new NotFoundException('Despesa nao encontrada.');
    }
    // Ocorrencia gerada de despesa fixa: registra lapide para nao ressuscitar na proxima listagem.
    if (expense.fixedExpenseId && expense.fixedExpenseCompetence) {
      await this.prisma.$transaction([
        this.prisma.fixedExpense.updateMany({
          where: { id: expense.fixedExpenseId, userId },
          data: {
            skippedCompetences: { push: expense.fixedExpenseCompetence },
          },
        }),
        this.prisma.expense.deleteMany({ where: { id: expense.id, userId } }),
      ]);
      return expense;
    }
    await this.prisma.expense.deleteMany({ where: { id: expense.id, userId } });
    return expense;
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: { tagId?: string | null; creditorId?: string | null },
  ) {
    await assertOwnedRefs(this.prisma, userId, dto);
    const count = await this.prisma.expense.count({
      where: { installmentGroupId: groupId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Grupo de parcelas nao encontrado.');
    }
    return this.prisma.expense.updateMany({
      where: { installmentGroupId: groupId, userId },
      data: dto,
    });
  }

  async removeGroup(userId: string, groupId: string) {
    const { count } = await this.prisma.expense.deleteMany({
      where: { installmentGroupId: groupId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Grupo de parcelas nao encontrado.');
    }
    return { deleted: count };
  }

  async createInstallments(userId: string, dto: CreateInstallmentsDto) {
    await assertOwnedRefs(this.prisma, userId, dto);
    const groupId = randomUUID();
    const baseDate = new Date(dto.startDate);
    const data = Array.from({ length: dto.totalInstallments }, (_v, i) => {
      const d = new Date(baseDate);
      d.setMonth(baseDate.getMonth() + i);
      return {
        item: `${i + 1}/${dto.totalInstallments} - ${dto.item}`,
        amount: dto.amount,
        date: d,
        tagId: dto.tagId ?? null,
        isPaid: dto.isPaid ?? false,
        userId,
        installmentGroupId: groupId,
        installmentNumber: i + 1,
        installmentTotal: dto.totalInstallments,
        creditorId: dto.creditorId ?? null,
      };
    });

    const result = await this.prisma.expense.createMany({ data });
    return { groupId, count: result.count };
  }
}
