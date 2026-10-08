import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSavingsGoalDto,
  CreateSavingsMovementDto,
  UpdateSavingsGoalDto,
} from './dto/savings-goal.dto';
import { goalProgress } from './goal-progress';
import {
  currentMonthKey,
  monthKeyOf,
  toDateOnly,
} from '../fixed-expenses/occurrence-utils';

const INCLUDE = {
  movements: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
} satisfies Prisma.SavingsGoalInclude;

type GoalWithMovements = Prisma.SavingsGoalGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class SavingsGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const goals = await this.prisma.savingsGoal.findMany({
      where: { userId },
      orderBy: [{ targetDate: 'asc' }, { name: 'asc' }],
      include: INCLUDE,
    });
    return goals.map((g) => this.withProgress(g));
  }

  async create(userId: string, dto: CreateSavingsGoalDto) {
    const targetDate = toDateOnly(dto.targetDate);
    this.assertDeadline(targetDate);
    const goal = await this.prisma.savingsGoal.create({
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount,
        targetDate,
        initialAmount: dto.initialAmount ?? 0,
        isEmergencyFund: dto.isEmergencyFund ?? false,
        userId,
      },
      include: INCLUDE,
    });
    return this.withProgress(goal);
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto) {
    await this.findOneOrFail(userId, id);

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

    const { count } = await this.prisma.savingsGoal.updateMany({
      where: { id, userId },
      data,
    });
    if (count === 0) this.notFound();
    return this.withProgress(await this.findOneOrFail(userId, id));
  }

  async remove(userId: string, id: string) {
    const goal = await this.findOneOrFail(userId, id);
    // Movimentacoes caem em cascata (FK onDelete: Cascade).
    await this.prisma.savingsGoal.deleteMany({ where: { id, userId } });
    return goal;
  }

  async addMovement(
    userId: string,
    goalId: string,
    dto: CreateSavingsMovementDto,
  ) {
    const goal = await this.findOneOrFail(userId, goalId);
    if (dto.type === 'WITHDRAW') {
      const { saved } = goalProgress(goal, goal.movements);
      if (Math.round(dto.amount * 100) > Math.round(saved * 100)) {
        throw new BadRequestException(
          'Valor maior do que o guardado nesta meta.',
        );
      }
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
    return this.withProgress(await this.findOneOrFail(userId, goalId));
  }

  async removeMovement(userId: string, goalId: string, movementId: string) {
    const goal = await this.findOneOrFail(userId, goalId);
    const movement = goal.movements.find((m) => m.id === movementId);
    if (!movement) {
      throw new NotFoundException('Movimentacao nao encontrada.');
    }
    // Desfazer um aporte nao pode deixar a meta com saldo negativo (retiradas posteriores).
    const rest = goal.movements.filter((m) => m.id !== movementId);
    if (goalProgress(goal, rest).saved < 0) {
      throw new BadRequestException(
        'Exclua antes as retiradas que usam este aporte.',
      );
    }
    const { count } = await this.prisma.savingsMovement.deleteMany({
      where: { id: movementId, goalId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Movimentacao nao encontrada.');
    }
    return this.withProgress(await this.findOneOrFail(userId, goalId));
  }

  private withProgress(goal: GoalWithMovements) {
    return { ...goal, progress: goalProgress(goal, goal.movements) };
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
