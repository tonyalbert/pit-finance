import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { assertOwnedRefs } from '../common/assert-owned-refs';
import { IncomeOccurrencesService } from '../fixed-incomes/income-occurrences.service';

@Injectable()
export class IncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: IncomeOccurrencesService,
  ) {}

  async create(userId: string, dto: CreateIncomeDto) {
    await assertOwnedRefs(this.prisma, userId, { tagId: dto.tagId });
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

  async findAll(userId: string) {
    // Self-healing: garante as ocorrencias faltantes das receitas fixas (nunca quebra a listagem).
    await this.occurrences.ensureSafe(userId);
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

    await assertOwnedRefs(this.prisma, userId, { tagId: dto.tagId });

    // Mutacao escopada por userId na propria query (whitelist explicita dos campos editaveis).
    const { count } = await this.prisma.income.updateMany({
      where: { id: income.id, userId },
      data: {
        source: dto.source,
        amount: dto.amount,
        date: dto.date ? new Date(dto.date) : undefined,
        tagId: dto.tagId,
      },
    });
    if (count === 0) {
      throw new NotFoundException('Receita nao encontrada.');
    }
    return this.prisma.income.findFirstOrThrow({
      where: { id: income.id, userId },
    });
  }

  async remove(userId: string, id: string) {
    const income = await this.prisma.income.findFirst({
      where: { id, userId },
    });
    if (!income) {
      throw new NotFoundException('Receita nao encontrada.');
    }
    // Ocorrencia gerada de receita fixa: registra lapide para nao ressuscitar na proxima listagem.
    if (income.fixedIncomeId && income.fixedIncomeCompetence) {
      await this.prisma.$transaction([
        this.prisma.fixedIncome.updateMany({
          where: { id: income.fixedIncomeId, userId },
          data: {
            skippedCompetences: { push: income.fixedIncomeCompetence },
          },
        }),
        this.prisma.income.deleteMany({ where: { id: income.id, userId } }),
      ]);
      return income;
    }
    await this.prisma.income.deleteMany({ where: { id: income.id, userId } });
    return income;
  }
}
