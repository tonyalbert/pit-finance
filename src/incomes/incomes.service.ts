import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';

@Injectable()
export class IncomesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateIncomeDto) {
    return this.prisma.income.create({
      data: {
        source: dto.source,
        amount: dto.amount,
        date: new Date(dto.date),
        tagId: dto.tagId ?? null,
        userId,
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.income.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateIncomeDto) {
    const income = await this.prisma.income.findFirst({
      where: { id, userId },
    });
    if (!income) {
      throw new NotFoundException('Receita nao encontrada.');
    }

    return this.prisma.income.update({
      where: { id: income.id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    const income = await this.prisma.income.findFirst({
      where: { id, userId },
    });
    if (!income) {
      throw new NotFoundException('Receita nao encontrada.');
    }
    return this.prisma.income.delete({ where: { id: income.id } });
  }
}
