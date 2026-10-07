import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, computeAccess } from '../billing/access';
import { UpdateAccessDto } from './dto/admin-users.dto';

const USER_SELECT = {
  id: true,
  email: true,
  isAdmin: true,
  lifetimeAccess: true,
  trialStartedAt: true,
  trialEndsAt: true,
  createdAt: true,
  subscription: {
    select: {
      status: true,
      plan: true,
      currentPeriodEnd: true,
      cancelledAt: true,
    },
  },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const LIST_LIMIT = 500;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private view(u: AdminUserRow) {
    return { ...u, access: computeAccess(u) };
  }

  async listUsers(search?: string) {
    const q = search?.trim();
    const users = await this.prisma.user.findMany({
      where: q ? { email: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: USER_SELECT,
    });
    return users.map((u) => this.view(u));
  }

  async setPassword(id: string, password: string) {
    await this.findOrFail(id);
    const passwordHash = await bcrypt.hash(password, 10);
    // Invalida links de "esqueci a senha" pendentes junto com a troca.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: id, used: false },
        data: { used: true },
      }),
    ]);
    return { message: 'Senha alterada.' };
  }

  /** Soma dias gratis a partir do fim do acesso atual (teste ou periodo pago; agora, se nada vigente). */
  async extendTrial(id: string, days: number) {
    const user = await this.findOrFail(id);
    const base = [
      user.trialEndsAt,
      user.subscription?.currentPeriodEnd ?? null,
    ].reduce<Date>((acc, d) => (d && d > acc ? d : acc), new Date());
    const updated = await this.prisma.user.update({
      where: { id },
      data: { trialEndsAt: addDays(base, days) },
      select: USER_SELECT,
    });
    return this.view(updated);
  }

  async updateAccess(id: string, dto: UpdateAccessDto) {
    await this.findOrFail(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.lifetimeAccess !== undefined)
      data.lifetimeAccess = dto.lifetimeAccess;
    if (dto.trialEndsAt !== undefined) {
      data.trialEndsAt =
        dto.trialEndsAt === null ? null : new Date(dto.trialEndsAt);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
    return this.view(updated);
  }

  private async findOrFail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        trialEndsAt: true,
        subscription: { select: { currentPeriodEnd: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');
    return user;
  }
}
