/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ConflictException } from '@nestjs/common';
import { BillingService } from './billing.service';

type U = {
  isAdmin: boolean;
  lifetimeAccess: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  subscription: null;
};

function makeDb(user: U) {
  return {
    user: {
      findUnique: jest.fn(async () => user),
      findUniqueOrThrow: jest.fn(async () => user),
      // Simula o WHERE trialStartedAt IS NULL atomico do banco.
      updateMany: jest.fn(async ({ where, data }) => {
        if (where.trialStartedAt === null && user.trialStartedAt !== null) {
          return { count: 0 };
        }
        Object.assign(user, data);
        return { count: 1 };
      }),
    },
  };
}

describe('BillingService.startTrial', () => {
  const abacate = { listProducts: jest.fn(async () => []) };
  let user: U;
  let service: BillingService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T12:00:00Z'));
    user = {
      isAdmin: false,
      lifetimeAccess: false,
      trialStartedAt: null,
      trialEndsAt: null,
      subscription: null,
    };
    service = new BillingService(makeDb(user) as never, abacate as never);
  });
  afterEach(() => jest.useRealTimers());

  it('cadastro novo pode escolher o teste; status mostra disponivel', async () => {
    const before = await service.status('u1');
    expect(before.trialAvailable).toBe(true);
    expect(before.access.hasAccess).toBe(false);

    const after = await service.startTrial('u1');
    expect(after.access).toMatchObject({ kind: 'trial', daysLeft: 7 });
    expect(after.trialAvailable).toBe(false);
    expect(user.trialEndsAt!.toISOString()).toBe('2026-10-11T12:00:00.000Z');
  });

  it('teste e unico por conta, mesmo depois de encerrado pelo admin', async () => {
    await service.startTrial('u1');
    user.trialEndsAt = null; // admin encerrou
    expect((await service.status('u1')).trialAvailable).toBe(false);
    await expect(service.startTrial('u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('quem ja tem acesso nao inicia teste', async () => {
    user.lifetimeAccess = true;
    await expect(service.startTrial('u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(user.trialStartedAt).toBeNull();
  });
});
