import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSavingsGoalDto,
  CreateSavingsLoanDto,
  CreateSavingsMovementDto,
  UpdateSavingsGoalDto,
} from './dto/savings-goal.dto';
import { goalProgress } from './goal-progress';
import { LoanTotals, dueDates, installmentAmount } from './loan-math';
import {
  currentMonthKey,
  monthKeyOf,
  toDateOnly,
} from '../fixed-expenses/occurrence-utils';

const INCLUDE = {
  movements: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
  loans: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SavingsGoalInclude;

type GoalWithRelations = Prisma.SavingsGoalGetPayload<{
  include: typeof INCLUDE;
}>;

type InstallmentRow = {
  id: string;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  amount: Prisma.Decimal;
  isPaid: boolean;
  date: Date;
};

const cents = (v: unknown): number => Math.round(Number(v) * 100);

@Injectable()
export class SavingsGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { userId },
      orderBy: [{ targetDate: 'asc' }, { name: 'asc' }],
      include: INCLUDE,
    });
    return this.decorate(userId, goals);
  }

  async create(userId: string, dto: CreateSavingsGoalDto) {
    const targetDate = toDateOnly(dto.targetDate);
    this.assertDeadline(targetDate);
    if (dto.startMonth !== undefined)
      this.assertStart(dto.startMonth, targetDate);
    const goal = await this.prisma.savingsGoal.create({
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount,
        targetDate,
        initialAmount: dto.initialAmount ?? 0,
        isEmergencyFund: dto.isEmergencyFund ?? false,
        startMonth: dto.startMonth ?? null,
        userId,
      },
      include: INCLUDE,
    });
    return (await this.decorate(userId, [goal]))[0];
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto) {
    const current = await this.findOneOrFail(userId, id);

    // Whitelist explicita: nunca repassa o dto direto ao Prisma.
    const data: Prisma.SavingsGoalUpdateManyMutationInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.targetAmount !== undefined) data.targetAmount = dto.targetAmount;
    if (dto.initialAmount !== undefined) data.initialAmount = dto.initialAmount;
    if (dto.targetDate !== undefined) {
      const targetDate = toDateOnly(dto.targetDate);
      this.assertDeadline(targetDate);
      data.targetDate = targetDate;
    }
    if (dto.startMonth !== undefined) {
      this.assertStart(
        dto.startMonth,
        (data.targetDate as Date) ?? current.targetDate,
      );
      data.startMonth = dto.startMonth;
    }

    const { count } = await this.prisma.savingsGoal.updateMany({
      where: { id, userId },
      data,
    });
    if (count === 0) this.notFound();
    return this.loadOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const goal = await this.findOneOrFail(userId, id);
    // Movimentacoes e emprestimos caem em cascata. Parcelas NAO pagas de emprestimos desta meta
    // deixam de fazer sentido (devolver para uma meta que nao existe): saem junto. Pagas ficam como historico.
    const groups = goal.loans.map((l) => l.installmentGroupId);
    await this.prisma.$transaction([
      this.prisma.expense.deleteMany({
        where: { userId, installmentGroupId: { in: groups }, isPaid: false },
      }),
      this.prisma.savingsGoal.deleteMany({ where: { id, userId } }),
    ]);
    return goal;
  }

  async addMovement(
    userId: string,
    goalId: string,
    dto: CreateSavingsMovementDto,
  ) {
    const goal = await this.loadOne(userId, goalId);
    if (
      dto.type === 'WITHDRAW' &&
      cents(dto.amount) > cents(goal.progress.saved)
    ) {
      throw new BadRequestException(
        'Valor maior do que o guardado nesta meta.',
      );
    }
    await this.prisma.savingsMovement.create({
      data: {
        goalId,
        userId,
        type: dto.type,
        amount: dto.amount,
        date: toDateOnly(dto.date),
      },
    });
    return this.loadOne(userId, goalId);
  }

  async removeMovement(userId: string, goalId: string, movementId: string) {
    const goal = await this.findOneOrFail(userId, goalId);
    const movement = goal.movements.find((m) => m.id === movementId);
    if (!movement) {
      throw new NotFoundException('Movimentacao nao encontrada.');
    }
    // Desfazer um aporte nao pode deixar a meta com saldo negativo (retiradas/emprestimos posteriores).
    const totals = (await this.loanSummaries(userId, [goal])).totals.get(
      goal.id,
    );
    const rest = goal.movements.filter((m) => m.id !== movementId);
    if (goalProgress(goal, rest, undefined, totals).saved < 0) {
      throw new BadRequestException(
        'Exclua antes as retiradas ou emprestimos que usam este aporte.',
      );
    }
    const { count } = await this.prisma.savingsMovement.deleteMany({
      where: { id: movementId, goalId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Movimentacao nao encontrada.');
    }
    return this.loadOne(userId, goalId);
  }

  // ---------- Emprestimos da propria meta ----------

  async createLoan(userId: string, goalId: string, dto: CreateSavingsLoanDto) {
    const goal = await this.loadOne(userId, goalId);
    if (cents(dto.amount) > cents(goal.progress.saved)) {
      throw new BadRequestException(
        'Valor maior do que o disponivel nesta meta.',
      );
    }
    const firstDueDate = toDateOnly(dto.firstDueDate);
    if (monthKeyOf(firstDueDate) < currentMonthKey()) {
      throw new BadRequestException(
        'A primeira parcela deve vencer a partir do mes atual.',
      );
    }

    const amount = installmentAmount(
      dto.amount,
      dto.monthlyRate,
      dto.installments,
    );
    const groupId = randomUUID();
    const label = goal.isEmergencyFund
      ? 'Empréstimo da reserva'
      : `Empréstimo: ${goal.name}`;
    const dates = dueDates(firstDueDate, dto.installments);

    // Parcelas = despesas parceladas comuns (aparecem em Despesas / A pagar).
    await this.prisma.$transaction([
      this.prisma.savingsLoan.create({
        data: {
          goalId,
          userId,
          principal: dto.amount,
          monthlyRate: dto.monthlyRate,
          installments: dto.installments,
          installmentAmount: amount,
          firstDueDate,
          installmentGroupId: groupId,
        },
      }),
      this.prisma.expense.createMany({
        data: dates.map((date, i) => ({
          item: `${i + 1}/${dto.installments} - ${label}`,
          amount,
          date,
          isPaid: false,
          userId,
          installmentGroupId: groupId,
          installmentNumber: i + 1,
          installmentTotal: dto.installments,
          tagId: null,
          creditorId: null,
        })),
      }),
    ]);
    return this.loadOne(userId, goalId);
  }

  async removeLoan(userId: string, goalId: string, loanId: string) {
    const goal = await this.findOneOrFail(userId, goalId);
    const loan = goal.loans.find((l) => l.id === loanId);
    if (!loan) throw new NotFoundException('Emprestimo nao encontrado.');

    const paid = await this.prisma.expense.count({
      where: {
        userId,
        installmentGroupId: loan.installmentGroupId,
        isPaid: true,
      },
    });
    if (paid > 0) {
      throw new BadRequestException(
        'Ja ha parcelas pagas: para encerrar, pague as parcelas restantes.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.expense.deleteMany({
        where: { userId, installmentGroupId: loan.installmentGroupId },
      }),
      this.prisma.savingsLoan.deleteMany({ where: { id: loanId, userId } }),
    ]);
    return this.loadOne(userId, goalId);
  }

  // ---------- Montagem da resposta ----------

  /** Parcelas (despesas) de cada emprestimo, totais por meta e resumo por emprestimo. */
  private async loanSummaries(userId: string, goals: GoalWithRelations[]) {
    const loans = goals.flatMap((g) => g.loans);
    const rows: InstallmentRow[] = loans.length
      ? await this.prisma.expense.findMany({
          where: {
            userId,
            installmentGroupId: { in: loans.map((l) => l.installmentGroupId) },
          },
          select: {
            id: true,
            installmentGroupId: true,
            installmentNumber: true,
            amount: true,
            isPaid: true,
            date: true,
          },
          orderBy: { installmentNumber: 'asc' },
        })
      : [];

    const byGroup = new Map<string, InstallmentRow[]>();
    for (const r of rows) {
      const list = byGroup.get(r.installmentGroupId!) ?? [];
      list.push(r);
      byGroup.set(r.installmentGroupId!, list);
    }

    const totals = new Map<string, LoanTotals>();
    const perLoan = new Map<string, ReturnType<typeof summarize>>();
    for (const g of goals) {
      const t: LoanTotals = { lent: 0, repaid: 0, pending: 0 };
      for (const loan of g.loans) {
        const s = summarize(byGroup.get(loan.installmentGroupId) ?? []);
        perLoan.set(loan.id, s);
        t.lent += Number(loan.principal);
        t.repaid += s.paidAmount;
        t.pending += s.pendingAmount;
      }
      totals.set(g.id, t);
    }
    return { totals, perLoan };
  }

  private async decorate(userId: string, goals: GoalWithRelations[]) {
    const { totals, perLoan } = await this.loanSummaries(userId, goals);
    return goals.map((g) => ({
      ...g,
      loans: g.loans.map((l) => ({ ...l, ...perLoan.get(l.id)! })),
      progress: goalProgress(g, g.movements, undefined, totals.get(g.id)),
    }));
  }

  private async loadOne(userId: string, id: string) {
    return (
      await this.decorate(userId, [await this.findOneOrFail(userId, id)])
    )[0];
  }

  /** Inicio dos aportes: do mes atual ate o mes do prazo. */
  private assertStart(startMonth: string, targetDate: Date) {
    if (startMonth < currentMonthKey()) {
      throw new BadRequestException(
        'O inicio dos aportes deve ser a partir do mes atual.',
      );
    }
    if (startMonth > monthKeyOf(targetDate)) {
      throw new BadRequestException(
        'O inicio dos aportes deve ser ate o mes do prazo.',
      );
    }
  }

  private assertDeadline(targetDate: Date) {
    if (monthKeyOf(targetDate) < currentMonthKey()) {
      throw new BadRequestException('O prazo deve ser a partir do mes atual.');
    }
  }

  private notFound(): never {
    throw new NotFoundException('Meta nao encontrada.');
  }

  private async findOneOrFail(userId: string, id: string) {
    const goal = await this.prisma.savingsGoal.findFirst({
      where: { id, userId },
      include: INCLUDE,
    });
    if (!goal) this.notFound();
    return goal;
  }
}

/** Resumo das parcelas de um emprestimo (as que o usuario excluiu em Despesas simplesmente nao contam). */
function summarize(rows: InstallmentRow[]) {
  const paid = rows.filter((r) => r.isPaid);
  const open = rows.filter((r) => !r.isPaid);
  const sum = (list: InstallmentRow[]) =>
    list.reduce((s, r) => s + cents(r.amount), 0) / 100;
  const next = open[0];
  return {
    paidCount: paid.length,
    remainingCount: open.length,
    paidAmount: sum(paid),
    pendingAmount: sum(open),
    nextInstallment: next
      ? {
          expenseId: next.id,
          number: next.installmentNumber,
          date: next.date,
          amount: Number(next.amount),
        }
      : null,
  };
}
