import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateInstallmentsDto } from './dto/create-installments.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateExpenseDto) {
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

  findAll(userId: string) {
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

    return this.prisma.expense.update({
      where: { id: expense.id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, userId },
    });
    if (!expense) {
      throw new NotFoundException('Despesa nao encontrada.');
    }
    return this.prisma.expense.delete({ where: { id: expense.id } });
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: { tagId?: string | null; creditorId?: string | null },
  ) {
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
