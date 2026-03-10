import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCreditorDto } from './dto/create-creditor.dto';
import { UpdateCreditorDto } from './dto/update-creditor.dto';

@Injectable()
export class CreditorsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateCreditorDto) {
    return this.prisma.creditor.create({
      data: {
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        userId,
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.creditor.findMany({
      where: { userId },
      include: {
        _count: {
          select: { expenses: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const creditor = await this.prisma.creditor.findFirst({
      where: { id, userId },
      include: {
        expenses: {
          where: { userId },
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!creditor) {
      throw new NotFoundException('Credor nao encontrado.');
    }

    return creditor;
  }

  async update(userId: string, id: string, dto: UpdateCreditorDto) {
    const creditor = await this.prisma.creditor.findFirst({
      where: { id, userId },
    });
    if (!creditor) {
      throw new NotFoundException('Credor nao encontrado.');
    }

    return this.prisma.creditor.update({
      where: { id: creditor.id },
      data: {
        ...dto,
      },
    });
  }

  async remove(userId: string, id: string) {
    const creditor = await this.prisma.creditor.findFirst({
      where: { id, userId },
    });
    if (!creditor) {
      throw new NotFoundException('Credor nao encontrado.');
    }
    return this.prisma.creditor.delete({ where: { id: creditor.id } });
  }

  async getDebtsSummary(userId: string, month?: number, year?: number) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (month !== undefined && year !== undefined) {
      dateFilter.gte = new Date(year, month - 1, 1);
      dateFilter.lte = new Date(year, month, 0, 23, 59, 59, 999);
    }

    const creditors = await this.prisma.creditor.findMany({
      where: { userId },
      include: {
        expenses: {
          where: {
            userId,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
          },
          select: {
            amount: true,
            isPaid: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return creditors
      .map((creditor) => {
        const totalAmount = creditor.expenses.reduce(
          (sum, exp) => sum + Number(exp.amount),
          0,
        );
        const paidAmount = creditor.expenses
          .filter((exp) => exp.isPaid)
          .reduce((sum, exp) => sum + Number(exp.amount), 0);
        const unpaidAmount = totalAmount - paidAmount;

        return {
          id: creditor.id,
          name: creditor.name,
          phone: creditor.phone,
          email: creditor.email,
          totalAmount,
          paidAmount,
          unpaidAmount,
          isPaidOff: unpaidAmount === 0 && creditor.expenses.length > 0,
          expenseCount: creditor.expenses.length,
        };
      })
      .filter((c) => (month !== undefined ? c.expenseCount > 0 : true));
  }
}
