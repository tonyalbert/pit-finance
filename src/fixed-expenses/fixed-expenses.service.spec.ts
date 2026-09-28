/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { OccurrencesService } from './occurrences.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function makePrisma() {
  return {
    fixedExpense: {
      create: jest.fn(async ({ data }) => ({ id: 'fe1', ...data })),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(async () => ({ id: 'fe1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    expense: {
      create: jest.fn(async ({ data }) => ({ id: 'ex1', ...data })),
      findFirst: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any[]> => []),
      createMany: jest.fn(async () => ({ count: 0 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    tag: { findFirst: jest.fn() },
    creditor: { findFirst: jest.fn() },
  };
}

describe('FixedExpensesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: FixedExpensesService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-28T12:00:00Z'));
    process.env.FIXED_EXPENSES_AUTOGEN = 'true';
    prisma = makePrisma();
    service = new FixedExpensesService(
      prisma as never,
      new OccurrencesService(prisma as never),
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.FIXED_EXPENSES_AUTOGEN;
  });

  const base = { name: 'Aluguel', amount: 100, dayOfMonth: 5 };

  describe('create', () => {
    it('grava a regra sem gerar faturas (com e sem endDate)', async () => {
      await service.create('u1', { ...base, startDate: '2026-03-01' });
      await service.create('u1', {
        ...base,
        startDate: '2026-03-01',
        endDate: '2026-12-31',
      });
      expect(prisma.expense.create).not.toHaveBeenCalled();
      const [first, second] = prisma.fixedExpense.create.mock.calls.map(
        (c: any) => c[0].data,
      );
      expect(first.endDate).toBeNull();
      expect(second.endDate).toEqual(d('2026-12-31'));
    });

    it('endDate < startDate => 400', async () => {
      await expect(
        service.create('u1', {
          ...base,
          startDate: '2026-03-01',
          endDate: '2026-02-28',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tagId de outro usuario => 400', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);
      await expect(
        service.create('u1', { ...base, startDate: '2026-03-01', tagId: 't' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't', userId: 'u1' } }),
      );
    });
  });

  describe('update', () => {
    const current = {
      id: 'fe1',
      startDate: d('2026-03-01'),
      endDate: d('2026-06-30'),
    };

    it('outro usuario => 404', async () => {
      prisma.fixedExpense.findFirst.mockResolvedValue(null);
      await expect(
        service.update('u2', 'fe1', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fixedExpense.updateMany).not.toHaveBeenCalled();
    });

    it('so startDate posterior ao endDate existente => 400 (valida mesclado)', async () => {
      prisma.fixedExpense.findFirst.mockResolvedValue(current);
      await expect(
        service.update('u1', 'fe1', { startDate: '2026-08-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('endDate:null limpa; undefined nao altera; whitelist e escopo por userId', async () => {
      prisma.fixedExpense.findFirst.mockResolvedValue(current);
      await service.update('u1', 'fe1', { endDate: null, amount: 50 });
      expect(prisma.fixedExpense.updateMany).toHaveBeenCalledWith({
        where: { id: 'fe1', userId: 'u1' },
        data: { endDate: null, amount: 50 },
      });
    });
  });

  describe('remove', () => {
    it('escopa por userId e 404 se nao existir', async () => {
      prisma.fixedExpense.findFirst.mockResolvedValue(null);
      await expect(service.remove('u1', 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      prisma.fixedExpense.findFirst.mockResolvedValue({ id: 'fe1' });
      await service.remove('u1', 'fe1');
      expect(prisma.fixedExpense.deleteMany).toHaveBeenCalledWith({
        where: { id: 'fe1', userId: 'u1' },
      });
    });
  });

  describe('generateForMonth', () => {
    const rule = (over = {}) => ({
      id: 'fe1',
      name: 'Aluguel',
      amount: 100,
      dayOfMonth: 5,
      tagId: null,
      creditorId: null,
      startDate: d('2026-03-01'),
      endDate: null,
      ...over,
    });

    it.each([
      [2026, 0],
      [2026, 13],
      [1999, 5],
      [2028, 5],
    ])('valida ano/mes (%i/%i) => 400', async (y, m) => {
      await expect(service.generateForMonth('u1', y, m)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('nao limita mais o futuro (ate ano corrente + 1)', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([]);
      await expect(service.generateForMonth('u1', 2027, 12)).resolves.toEqual({
        generated: 0,
        skipped: 0,
        expenses: [],
      });
    });

    it('permite mes corrente + 1', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([]);
      await expect(service.generateForMonth('u1', 2026, 10)).resolves.toEqual({
        generated: 0,
        skipped: 0,
        expenses: [],
      });
    });

    it('flag desligada (ausente/false): generate nao le nem escreve nada', async () => {
      for (const v of [undefined, 'false']) {
        if (v === undefined) delete process.env.FIXED_EXPENSES_AUTOGEN;
        else process.env.FIXED_EXPENSES_AUTOGEN = v;
        prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
        await expect(service.generateForMonth('u1', 2026, 4)).resolves.toEqual({
          generated: 0,
          skipped: 0,
          expenses: [],
        });
      }
      expect(prisma.expense.create).not.toHaveBeenCalled();
      expect(prisma.fixedExpense.findMany).not.toHaveBeenCalled();
    });

    it('flag desligada ainda valida mes/ano (400)', async () => {
      delete process.env.FIXED_EXPENSES_AUTOGEN;
      await expect(
        service.generateForMonth('u1', 2026, 13),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('gera 1 fatura com competencia e data em UTC', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
      const r = await service.generateForMonth('u1', 2026, 4);
      expect(r.generated).toBe(1);
      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.fixedExpenseCompetence).toBe('2026-04');
      expect(data.date).toEqual(d('2026-04-05'));
      expect(prisma.fixedExpense.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isActive: true },
      });
    });

    it('dia 31 clampado (fev/abr) e mes de 31 dias', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([
        rule({ dayOfMonth: 31, startDate: d('2026-01-01') }),
      ]);
      await service.generateForMonth('u1', 2026, 2);
      await service.generateForMonth('u1', 2026, 4);
      await service.generateForMonth('u1', 2026, 5);
      const dates = prisma.expense.create.mock.calls.map(
        (c: any) => c[0].data.date,
      );
      expect(dates).toEqual([
        d('2026-02-28'),
        d('2026-04-30'),
        d('2026-05-31'),
      ]);
    });

    it('respeita janela: antes do inicio e depois do fim nao gera; mes do fim inclusive', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([
        rule({ startDate: d('2026-03-15'), endDate: d('2026-05-20') }),
      ]);
      const before = await service.generateForMonth('u1', 2026, 2);
      const first = await service.generateForMonth('u1', 2026, 3);
      const last = await service.generateForMonth('u1', 2026, 5);
      const after = await service.generateForMonth('u1', 2026, 6);
      expect([
        before.generated,
        first.generated,
        last.generated,
        after.generated,
      ]).toEqual([0, 1, 1, 0]);
    });

    it('legada no mes => skipped, sem criar', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
      prisma.expense.findFirst.mockResolvedValue({ id: 'old' });
      const r = await service.generateForMonth('u1', 2026, 4);
      expect(r).toEqual({ generated: 0, skipped: 1, expenses: [] });
      expect(prisma.expense.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fixedExpenseCompetence: null,
            date: {
              gte: d('2026-04-01'),
              lt: d('2026-05-01'),
            },
          }),
        }),
      );
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('P2002 => skipped; outro erro propaga', async () => {
      prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
      prisma.expense.create.mockRejectedValueOnce({ code: 'P2002' });
      expect(await service.generateForMonth('u1', 2026, 4)).toEqual({
        generated: 0,
        skipped: 1,
        expenses: [],
      });
      prisma.expense.create.mockRejectedValueOnce(new Error('boom'));
      await expect(service.generateForMonth('u1', 2026, 4)).rejects.toThrow(
        'boom',
      );
    });
  });
});
