/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import { FixedIncomesService } from './fixed-incomes.service';
import { IncomeOccurrencesService } from './income-occurrences.service';
import { amountFor } from './amount-schedule';
import { IncomesService } from '../incomes/incomes.service';
import { occurrenceDate } from '../fixed-expenses/occurrence-utils';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'fi1',
  userId: 'u1',
  name: 'Salario',
  amount: 5000,
  dayOfMonth: 5,
  tagId: null,
  isActive: true,
  startDate: d('2026-01-01'),
  endDate: null,
  skippedCompetences: [],
  adjustments: [] as { amount: number; effectiveFrom: string }[],
  ...over,
});

function makePrisma() {
  return {
    fixedIncome: {
      create: jest.fn(async ({ data }) => ({ id: 'fi1', ...data })),
      findMany: jest.fn(async (): Promise<any[]> => []),
      findFirst: jest.fn(async (): Promise<any> => rule()),
      findFirstOrThrow: jest.fn(async () => ({ id: 'fi1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    fixedIncomeAdjustment: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async ({ data }) => data),
    },
    income: {
      findFirst: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any[]> => []),
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    tag: { findFirst: jest.fn() },
    creditor: { findFirst: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

describe('amountFor', () => {
  it('usa a base antes do primeiro reajuste e o reajuste mais recente depois', () => {
    const r = {
      amount: 5000,
      adjustments: [
        { effectiveFrom: '2027-01', amount: 6000 },
        { effectiveFrom: '2026-11', amount: 5500 },
      ],
    };
    expect(amountFor(r, '2026-10')).toBe(5000);
    expect(amountFor(r, '2026-11')).toBe(5500);
    expect(amountFor(r, '2026-12')).toBe(5500);
    expect(amountFor(r, '2027-01')).toBe(6000);
    expect(amountFor(r, '2030-05')).toBe(6000);
  });
});

describe('Receitas fixas', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let occ: IncomeOccurrencesService;
  let service: FixedIncomesService;
  const created = () =>
    prisma.income.createMany.mock.calls.flatMap((c: any) => c[0].data);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T12:00:00Z'));
    process.env.FIXED_INCOMES_AUTOGEN = 'true';
    prisma = makePrisma();
    occ = new IncomeOccurrencesService(prisma as never);
    service = new FixedIncomesService(prisma as never, occ);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.FIXED_INCOMES_AUTOGEN;
    delete process.env.FIXED_EXPENSES_AUTOGEN;
  });

  describe('flag', () => {
    it('herda FIXED_EXPENSES_AUTOGEN quando a propria esta ausente', () => {
      delete process.env.FIXED_INCOMES_AUTOGEN;
      expect(occ.enabled('u1')).toBe(false);
      process.env.FIXED_EXPENSES_AUTOGEN = 'true';
      expect(occ.enabled('u1')).toBe(true);
      process.env.FIXED_INCOMES_AUTOGEN = 'false';
      expect(occ.enabled('u1')).toBe(false);
    });
  });

  describe('ensure', () => {
    it('gera do mes corrente ate +12 com o valor vigente em cada competencia', async () => {
      prisma.fixedIncome.findMany.mockResolvedValue([
        rule({ adjustments: [{ effectiveFrom: '2027-01', amount: 5500 }] }),
      ]);
      await occ.ensure('u1');
      const rows = created();
      expect(rows).toHaveLength(13);
      expect(rows[0]).toMatchObject({
        source: 'Salario',
        amount: 5000,
        fixedIncomeId: 'fi1',
        fixedIncomeCompetence: '2026-10',
        date: occurrenceDate('2026-10', 5),
      });
      expect(
        rows.find((r: any) => r.fixedIncomeCompetence === '2026-12'),
      ).toMatchObject({ amount: 5000 });
      expect(
        rows.find((r: any) => r.fixedIncomeCompetence === '2027-01'),
      ).toMatchObject({ amount: 5500 });
      expect(rows[12]).toMatchObject({
        fixedIncomeCompetence: '2027-10',
        amount: 5500,
      });
    });

    it('nao recria competencias puladas nem existentes', async () => {
      prisma.fixedIncome.findMany.mockResolvedValue([
        rule({ skippedCompetences: ['2026-11'] }),
      ]);
      prisma.income.findMany.mockResolvedValue([
        {
          fixedIncomeId: 'fi1',
          fixedIncomeCompetence: '2026-10',
          date: d('2026-10-05'),
        },
      ]);
      await occ.ensure('u1');
      const comps = created().map((r: any) => r.fixedIncomeCompetence);
      expect(comps).not.toContain('2026-10');
      expect(comps).not.toContain('2026-11');
      expect(comps).toContain('2026-12');
    });
  });

  describe('update (reajuste)', () => {
    it('valor com vigencia futura grava reajuste, preserva a base e so muda as intocadas a partir dela', async () => {
      await service.update('u1', 'fi1', {
        amount: 5500,
        amountEffectiveFrom: '2027-01',
      });

      const data = (prisma.fixedIncome.updateMany.mock.calls[0] as any)[0].data;
      expect(data.amount).toBeUndefined();
      expect(prisma.fixedIncomeAdjustment.deleteMany).toHaveBeenCalledWith({
        where: { fixedIncomeId: 'fi1', effectiveFrom: { gte: '2027-01' } },
      });
      expect(prisma.fixedIncomeAdjustment.create).toHaveBeenCalledWith({
        data: { fixedIncomeId: 'fi1', effectiveFrom: '2027-01', amount: 5500 },
      });

      const touched = prisma.income.updateMany.mock.calls.map((c: any) => c[0]);
      const comps = touched.map((c: any) => c.where.fixedIncomeCompetence);
      expect(comps).not.toContain('2026-10');
      expect(comps).not.toContain('2026-12');
      expect(comps).toContain('2027-01');
      expect(touched[0]).toMatchObject({
        where: { amount: 5000, source: 'Salario' },
        data: { amount: 5500 },
      });
    });

    it('novo reajuste substitui os posteriores a ele', async () => {
      prisma.fixedIncome.findFirst.mockResolvedValue(
        rule({ adjustments: [{ effectiveFrom: '2027-03', amount: 7000 }] }),
      );
      await service.update('u1', 'fi1', {
        amount: 6000,
        amountEffectiveFrom: '2027-01',
      });
      const calls = prisma.income.updateMany.mock.calls.map((c: any) => c[0]);
      const mar = calls.find(
        (c: any) => c.where.fixedIncomeCompetence === '2027-03',
      );
      expect(mar).toMatchObject({
        where: { amount: 7000 },
        data: { amount: 6000 },
      });
    });

    it('sem vigencia corrige a base e limpa o historico', async () => {
      prisma.fixedIncome.findFirst.mockResolvedValue(
        rule({ adjustments: [{ effectiveFrom: '2027-03', amount: 7000 }] }),
      );
      await service.update('u1', 'fi1', { amount: 5200 });
      const data = (prisma.fixedIncome.updateMany.mock.calls[0] as any)[0].data;
      expect(data.amount).toBe(5200);
      expect(prisma.fixedIncomeAdjustment.deleteMany).toHaveBeenCalledWith({
        where: { fixedIncomeId: 'fi1' },
      });
      expect(prisma.fixedIncomeAdjustment.create).not.toHaveBeenCalled();
      // Atualiza o mes corrente (intocada com o valor antigo).
      const oct = prisma.income.updateMany.mock.calls
        .map((c: any) => c[0])
        .find((c: any) => c.where.fixedIncomeCompetence === '2026-10');
      expect(oct).toMatchObject({
        where: { amount: 5000 },
        data: { amount: 5200 },
      });
    });

    it('vigencia sem valor => 400', async () => {
      await expect(
        service.update('u1', 'fi1', { amountEffectiveFrom: '2027-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('so renomear nao mexe no valor nem nos reajustes', async () => {
      await service.update('u1', 'fi1', { name: 'Salario Empresa X' });
      expect(prisma.fixedIncomeAdjustment.deleteMany).not.toHaveBeenCalled();
      const first = prisma.income.updateMany.mock.calls[0] as any;
      expect(first[0].data).toMatchObject({
        source: 'Salario Empresa X',
        amount: 5000,
      });
    });
  });

  describe('IncomesService.remove', () => {
    it('ocorrencia gerada grava lapide da competencia', async () => {
      const incomes = new IncomesService(prisma as never, occ);
      prisma.income.findFirst.mockResolvedValue({
        id: 'i1',
        fixedIncomeId: 'fi1',
        fixedIncomeCompetence: '2026-11',
      });
      await incomes.remove('u1', 'i1');
      expect(prisma.fixedIncome.updateMany).toHaveBeenCalledWith({
        where: { id: 'fi1', userId: 'u1' },
        data: { skippedCompetences: { push: '2026-11' } },
      });
      expect(prisma.income.deleteMany).toHaveBeenCalledWith({
        where: { id: 'i1', userId: 'u1' },
      });
    });
  });
});
