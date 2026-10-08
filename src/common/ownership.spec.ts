/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { assertOwnedRefs } from './assert-owned-refs';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';

function makePrisma() {
  return {
    tag: { findFirst: jest.fn(async (): Promise<any> => null) },
    creditor: { findFirst: jest.fn(async (): Promise<any> => null) },
    expense: {
      create: jest.fn(async ({ data }: any) => ({ id: 'e1', ...data })),
      createMany: jest.fn(async () => ({ count: 1 })),
      findFirst: jest.fn(async (): Promise<any> => ({ id: 'e1' })),
      findFirstOrThrow: jest.fn(async () => ({ id: 'e1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 2),
    },
    income: {
      create: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data })),
      findFirst: jest.fn(async (): Promise<any> => ({ id: 'i1' })),
      findFirstOrThrow: jest.fn(async () => ({ id: 'i1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    fixedExpense: { updateMany: jest.fn(async () => ({ count: 1 })) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

const occ = { ensureSafe: jest.fn(async () => 0) };
const UUID = '11111111-1111-4111-8111-111111111111';

describe('assertOwnedRefs', () => {
  it('rejeita tag/credor de outro usuario (400, sem vazar) e escopa por userId', async () => {
    const prisma = makePrisma();
    await expect(
      assertOwnedRefs(prisma as never, 'B', { tagId: UUID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: UUID, userId: 'B' } }),
    );
    await expect(
      assertOwnedRefs(prisma as never, 'B', { creditorId: UUID }),
    ).rejects.toThrow('Credor invalido.');
  });

  it('aceita proprios, null e undefined (sem consultar)', async () => {
    const prisma = makePrisma();
    prisma.tag.findFirst.mockResolvedValue({ id: UUID });
    await expect(
      assertOwnedRefs(prisma as never, 'A', { tagId: UUID }),
    ).resolves.toBeUndefined();
    prisma.tag.findFirst.mockClear();
    await assertOwnedRefs(prisma as never, 'A', {
      tagId: null,
      creditorId: undefined,
    });
    expect(prisma.tag.findFirst).not.toHaveBeenCalled();
    expect(prisma.creditor.findFirst).not.toHaveBeenCalled();
  });
});

describe('ExpensesService: posse de tag/credor e escopo por userId', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ExpensesService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new ExpensesService(prisma as never, occ as never);
  });

  const base = { item: 'Mercado', amount: 10, date: '2026-09-10' };

  it('create com tag/credor de outro usuario => 400 e nada e gravado', async () => {
    await expect(
      svc.create('B', { ...base, tagId: UUID } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.create('B', { ...base, creditorId: UUID } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('create com refs proprios ou sem refs continua funcionando', async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: UUID });
    prisma.creditor.findFirst.mockResolvedValue({ id: UUID });
    await svc.create('A', { ...base, tagId: UUID, creditorId: UUID } as never);
    await svc.create('A', base as never);
    expect(prisma.expense.create).toHaveBeenCalledTimes(2);
  });

  it('update: refs alheios => 400 sem escrever; proprios/null ok; escopo userId no updateMany', async () => {
    await expect(
      svc.update('B', 'e1', { tagId: UUID } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.updateMany).not.toHaveBeenCalled();

    prisma.tag.findFirst.mockResolvedValue({ id: UUID });
    await svc.update('A', 'e1', { tagId: UUID, isPaid: true } as never);
    await svc.update('A', 'e1', { tagId: null } as never);
    const calls = prisma.expense.updateMany.mock.calls as any[];
    expect(calls[0][0].where).toEqual({ id: 'e1', userId: 'A' });
    expect(calls[0][0].data).toMatchObject({ tagId: UUID, isPaid: true });
    expect(calls[1][0].data.tagId).toBeNull();
  });

  it('update de despesa de outro usuario => 404; count 0 => 404', async () => {
    prisma.expense.findFirst.mockResolvedValue(null);
    await expect(svc.update('B', 'e1', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.expense.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.expense.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.update('A', 'e1', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('parcelas: refs alheios => 400 sem criar', async () => {
    await expect(
      svc.createInstallments('B', {
        item: 'Sofa',
        amount: 10,
        startDate: '2026-09-01',
        totalInstallments: 3,
        creditorId: UUID,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.createMany).not.toHaveBeenCalled();
  });

  it('updateGroup: refs alheios => 400 sem escrever', async () => {
    await expect(
      svc.updateGroup('B', 'g1', { tagId: UUID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.updateMany).not.toHaveBeenCalled();
  });

  it('remove escopa por userId (deleteMany) e devolve o registro', async () => {
    const res = await svc.remove('A', 'e1');
    expect(prisma.expense.deleteMany).toHaveBeenCalledWith({
      where: { id: 'e1', userId: 'A' },
    });
    expect(res).toEqual({ id: 'e1' });
  });
});

describe('IncomesService: posse de tag e escopo por userId', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: IncomesService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new IncomesService(
      prisma as never,
      {
        ensureSafe: jest.fn(async () => 0),
      } as never,
    );
  });
  const base = { source: 'Salario', amount: 100, date: '2026-09-05' };

  it('create com tag alheia => 400; propria/sem tag ok', async () => {
    await expect(
      svc.create('B', { ...base, tagId: UUID } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.income.create).not.toHaveBeenCalled();
    prisma.tag.findFirst.mockResolvedValue({ id: UUID });
    await svc.create('A', { ...base, tagId: UUID } as never);
    await svc.create('A', base as never);
    expect(prisma.income.create).toHaveBeenCalledTimes(2);
  });

  it('update com tag alheia => 400; ok escopa userId; outra conta => 404', async () => {
    await expect(
      svc.update('B', 'i1', { tagId: UUID } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.income.updateMany).not.toHaveBeenCalled();
    prisma.tag.findFirst.mockResolvedValue({ id: UUID });
    await svc.update('A', 'i1', { tagId: UUID } as never);
    expect((prisma.income.updateMany.mock.calls as any[])[0][0].where).toEqual({
      id: 'i1',
      userId: 'A',
    });
    prisma.income.findFirst.mockResolvedValue(null);
    await expect(svc.update('B', 'i1', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove escopa por userId', async () => {
    await svc.remove('A', 'i1');
    expect(prisma.income.deleteMany).toHaveBeenCalledWith({
      where: { id: 'i1', userId: 'A' },
    });
  });
});
