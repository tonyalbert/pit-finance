import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';

@Injectable()
export class FixedExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateFixedExpenseDto) {
    return this.prisma.fixedExpense.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        dayOfMonth: dto.dayOfMonth,
        startDate: new Date(dto.startDate),
        tagId: dto.tagId ?? null,
        creditorId: dto.creditorId ?? null,
        userId,
      },
      include: { tag: true, creditor: true },
    });
  }

  findAll(userId: string) {
    return this.prisma.fixedExpense.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { tag: true, creditor: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateFixedExpenseDto) {
    await this.findOneOrFail(userId, id);
    return this.prisma.fixedExpense.update({
      where: { id },
      data: dto,
      include: { tag: true, creditor: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOneOrFail(userId, id);
    return this.prisma.fixedExpense.delete({ where: { id } });
  }

  async generateForMonth(userId: string, year: number, month: number) {
    const fixedExpenses = await this.prisma.fixedExpense.findMany({
      where: { userId, isActive: true },
    });

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const maxDayInMonth = endOfMonth.getDate();

    const created: object[] = [];
    const skipped: string[] = [];

    for (const fe of fixedExpenses) {
      // Respeita startDate: nao gera para meses anteriores ao inicio
      if (new Date(year, month - 1, 1) < new Date(fe.startDate.getFullYear(), fe.startDate.getMonth(), 1)) {
        skipped.push(fe.name);
        continue;
      }

      const existing = await this.prisma.expense.findFirst({
        where: {
          fixedExpenseId: fe.id,
          date: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      if (existing) {
        skipped.push(fe.name);
        continue;
      }

      // Ajusta dia para meses com menos dias (ex: dia 31 em fevereiro → dia 28)
      const day = Math.min(fe.dayOfMonth, maxDayInMonth);

      const expense = await this.prisma.expense.create({
        data: {
          item: fe.name,
          amount: fe.amount,
          date: new Date(year, month - 1, day),
          tagId: fe.tagId,
          creditorId: fe.creditorId,
          userId,
          isPaid: false,
          fixedExpenseId: fe.id,
        },
      });

      created.push(expense);
    }

    return { generated: created.length, skipped: skipped.length, expenses: created };
  }

  private async findOneOrFail(userId: string, id: string) {
    const record = await this.prisma.fixedExpense.findFirst({ where: { id, userId } });
    if (!record) throw new NotFoundException('Despesa fixa nao encontrada.');
    return record;
  }
}
