/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { OccurrencesService } from './occurrences.service';
import { FixedExpensesService } from './fixed-expenses.service';
import { addMonths, currentMonthKey, occurrenceDate } from './occurrence-utils';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function makePrisma() {
  return {
    fixedExpense: {
      findMany: jest.fn(async (): Promise<any[]> => []),
      findFirst: jest.fn(async (): Promise<any> => null),
      findFirstOrThrow: jest.fn(async () => ({ id: 'r1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    expense: {
      findMany: jest.fn(async (): Promise<any[]> => []),
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    tag: { findFirst: jest.fn() },
    creditor: { findFirst: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Aluguel',
  amount: 100,
  dayOfMonth: 5,
  tagId: null,
  creditorId: null,
  startDate: d('2026-03-01'),
  endDate: null,
  skippedCompetences: [],
  ...over,
});

describe('occurrence-utils', () => {
  afterEach(() => jest.useRealTimers());

  it('mes corrente usa APP_TIMEZONE (fim do mes em Sao Paulo)', () => {
    // 2026-10-01T01:00Z ainda e 30/09 em Sao Paulo (UTC-3)
    expect(currentMonthKey(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09');
    expect(currentMonthKey(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10');
  });

  it('addMonths e clamp de dia (UTC)', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(occurrenceDate('2026-02', 31)).toEqual(d('2026-02-28'));
    expect(occurrenceDate('2026-04', 31)).toEqual(d('2026-04-30'));
    expect(occurrenceDate('2028-02', 31)).toEqual(d('2028-02-29'));
  });
});

describe('OccurrencesService.ensure', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: OccurrencesService;
  const created = () =>
    prisma.expense.createMany.mock.calls.flatMap((c: any) => c[0].data);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-28T12:00:00Z'));
    process.env.FIXED_EXPENSES_AUTOGEN = 'true';
    delete process.env.FIXED_EXPENSES_AUTOGEN_USERS;
    delete process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS;
    prisma = makePrisma();
    svc = new OccurrencesService(prisma as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.FIXED_EXPENSES_AUTOGEN;
    delete process.env.FIXED_EXPENSES_AUTOGEN_USERS;
    delete process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS;
  });

  it('flag ausente ou diferente de "true" => nada e lido nem criado', async () => {
    for (const v of [undefined, 'false', '1', 'TRUE']) {
      if (v === undefined) delete process.env.FIXED_EXPENSES_AUTOGEN;
      else process.env.FIXED_EXPENSES_AUTOGEN = v;
      expect(await svc.ensure('u1')).toBe(0);
    }
    expect(prisma.fixedExpense.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.createMany).not.toHaveBeenCalled();
  });

  it('FIXED_EXPENSES_AUTOGEN_USERS restringe usuarios', async () => {
    process.env.FIXED_EXPENSES_AUTOGEN_USERS = 'owner, other';
    expect(svc.enabled('u1')).toBe(false);
    expect(svc.enabled('owner')).toBe(true);
    await svc.ensure('u1');
    expect(prisma.fixedExpense.findMany).not.toHaveBeenCalled();
  });

  it('sem fim: mes corrente ate +12 (13 linhas), sem backfill, ordenadas, um createMany com skipDuplicates', async () => {
    prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
    await svc.ensure('u1');
    expect(prisma.expense.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.expense.createMany.mock.calls[0][0].skipDuplicates).toBe(
      true,
    );
    const comps = created().map((r: any) => r.fixedExpenseCompetence);
    expect(comps).toHaveLength(13);
    expect(comps[0]).toBe('2026-09');
    expect(comps[12]).toBe('2027-09');
    expect([...comps].sort()).toEqual(comps);
    expect(created().every((r: any) => r.isPaid === false)).toBe(true);
  });

  it('com endDate: janela para no mes do fim; endDate passada nao gera nada', async () => {
    prisma.fixedExpense.findMany.mockResolvedValue([
      rule({ id: 'a', endDate: d('2026-11-20') }),
      rule({ id: 'b', endDate: d('2026-06-30') }),
    ]);
    await svc.ensure('u1');
    const rows = created();
    expect(
      rows
        .filter((r: any) => r.fixedExpenseId === 'a')
        .map((r: any) => r.fixedExpenseCompetence),
    ).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(rows.some((r: any) => r.fixedExpenseId === 'b')).toBe(false);
  });

  it('startDate futura gera so a partir dela; limitada a +12', async () => {
    prisma.fixedExpense.findMany.mockResolvedValue([
      rule({ startDate: d('2027-01-15') }),
      rule({ id: 'far', startDate: d('2028-01-01') }),
    ]);
    await svc.ensure('u1');
    const rows = created();
    const r1 = rows.filter((r: any) => r.fixedExpenseId === 'r1');
    expect(r1[0].fixedExpenseCompetence).toBe('2027-01');
    expect(r1[r1.length - 1].fixedExpenseCompetence).toBe('2027-09');
    expect(rows.some((r: any) => r.fixedExpenseId === 'far')).toBe(false);
  });

  it('dia 31 clampado nos meses curtos', async () => {
    prisma.fixedExpense.findMany.mockResolvedValue([rule({ dayOfMonth: 31 })]);
    await svc.ensure('u1');
    const byComp = Object.fromEntries(
      created().map((r: any) => [r.fixedExpenseCompetence, r.date]),
    );
    expect(byComp['2026-11']).toEqual(d('2026-11-30'));
    expect(byComp['2027-02']).toEqual(d('2027-02-28'));
    expect(byComp['2026-10']).toEqual(d('2026-10-31'));
  });

  it('lapides e existentes (inclusive legada no mes) nao sao recriados', async () => {
    prisma.fixedExpense.findMany.mockResolvedValue([
      rule({ skippedCompetences: ['2026-10'] }),
    ]);
    prisma.expense.findMany.mockResolvedValue([
      {
        fixedExpenseId: 'r1',
        fixedExpenseCompetence: '2026-09',
        date: d('2026-09-05'),
      },
      {
        fixedExpenseId: 'r1',
        fixedExpenseCompetence: null,
        date: d('2026-11-05'),
      },
    ]);
    await svc.ensure('u1');
    const comps = created().map((r: any) => r.fixedExpenseCompetence);
    expect(comps).not.toContain('2026-09');
    expect(comps).not.toContain('2026-10');
    expect(comps).not.toContain('2026-11');
    expect(comps).toHaveLength(10);
    // a leitura de existentes usa lista (in) + legada por data, escopada por usuario
    const where = (prisma.expense.findMany.mock.calls[0] as any)[0].where;
    expect(where.userId).toBe('u1');
    expect(where.OR[0].fixedExpenseCompetence.in.length).toBeLessThanOrEqual(
      13,
    );
    expect(where.OR[1].fixedExpenseCompetence).toBeNull();
  });

  it('teto por execucao (MAX_ROWS)', async () => {
    process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS = '5';
    prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
    await svc.ensure('u1');
    expect(created()).toHaveLength(5);
  });

  it('teto truncou: nao memoiza (restante sai nas proximas chamadas); sem truncar, memoiza', async () => {
    process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS = '5';
    prisma.fixedExpense.findMany.mockResolvedValue([
      rule({ id: 'a' }),
      rule({ id: 'b' }),
      rule({ id: 'c' }),
    ]);
    await svc.ensure('u1');
    await svc.ensure('u1'); // imediato: nao ha memo, roda de novo
    expect(prisma.fixedExpense.findMany).toHaveBeenCalledTimes(2);
    process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS = '500';
    await svc.ensure('u1'); // sem truncar: materializa tudo e memoiza
    expect(created()).toHaveLength(5 + 5 + 39);
    await svc.ensure('u1');
    expect(prisma.fixedExpense.findMany).toHaveBeenCalledTimes(3);
  });

  it('coalesce chamadas concorrentes e memoiza sucesso; invalidate reabre', async () => {
    prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
    await Promise.all(Array.from({ length: 10 }, () => svc.ensure('u1')));
    expect(prisma.fixedExpense.findMany).toHaveBeenCalledTimes(1);
    await svc.ensure('u1'); // memo (5 min)
    expect(prisma.fixedExpense.findMany).toHaveBeenCalledTimes(1);
    svc.invalidate('u1');
    await svc.ensure('u1');
    expect(prisma.fixedExpense.findMany).toHaveBeenCalledTimes(2);
    jest.setSystemTime(new Date('2026-09-28T12:06:00Z')); // TTL expirou
    await svc.ensure('u1');
    expect(prisma.fixedExpense.findMany).toHaveBeenCalledTimes(3);
  });

  it('falha nao e memoizada; ensureSafe nao lanca', async () => {
    prisma.fixedExpense.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.ensureSafe('u1')).resolves.toBe(0);
    prisma.fixedExpense.findMany.mockResolvedValue([rule()]);
    await svc.ensure('u1');
    expect(prisma.expense.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('Propagacao ao editar/excluir regra', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let occ: OccurrencesService;
  let svc: FixedExpensesService;
  const current = {
    ...rule(),
    amount: 100,
    isActive: true,
    startDate: d('2026-03-01'),
    endDate: null as Date | null,
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-28T12:00:00Z'));
    process.env.FIXED_EXPENSES_AUTOGEN = 'true';
    prisma = makePrisma();
    prisma.fixedExpense.findFirst.mockResolvedValue(current);
    occ = new OccurrencesService(prisma as never);
    svc = new FixedExpensesService(prisma as never, occ);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.FIXED_EXPENSES_AUTOGEN;
  });

  it('alterar valor/dia atualiza so intocadas (valores anteriores) do mes corrente em diante', async () => {
    await svc.update('u1', 'r1', { amount: 150, dayOfMonth: 31 });
    const calls = prisma.expense.updateMany.mock.calls.map((c: any) => c[0]);
    expect(calls).toHaveLength(13);
    expect(calls[0].where).toMatchObject({
      userId: 'u1',
      fixedExpenseId: 'r1',
      fixedExpenseCompetence: '2026-09',
      isPaid: false,
      item: 'Aluguel',
      amount: 100,
      date: d('2026-09-05'),
    });
    expect(calls[0].data).toMatchObject({ amount: 150, date: d('2026-09-30') });
    expect(calls[12].where.fixedExpenseCompetence).toBe('2027-09');
  });

  it('endDate remove intocadas apos o mes do fim (e >= mes corrente); fim passado nao remove passadas', async () => {
    await svc.update('u1', 'r1', { endDate: '2026-11-30' });
    const removed = prisma.expense.deleteMany.mock.calls.map(
      (c: any) => c[0].where.fixedExpenseCompetence,
    );
    expect(removed[0]).toBe('2026-12');
    expect(removed).toHaveLength(10);

    prisma.expense.deleteMany.mockClear();
    await svc.update('u1', 'r1', { endDate: '2026-05-31' });
    const removed2 = prisma.expense.deleteMany.mock.calls.map(
      (c: any) => c[0].where.fixedExpenseCompetence,
    );
    expect(removed2[0]).toBe('2026-09'); // nada antes do mes corrente
    expect(removed2.every((c: string) => c >= '2026-09')).toBe(true);
  });

  it('startDate movida para depois remove intocadas anteriores (>= mes corrente)', async () => {
    await svc.update('u1', 'r1', { startDate: '2026-11-10' });
    const removed = prisma.expense.deleteMany.mock.calls.map(
      (c: any) => c[0].where.fixedExpenseCompetence,
    );
    expect(removed).toEqual(['2026-09', '2026-10']);
  });

  it('pausar remove intocadas nao pagas (>= mes corrente, inclui o corrente)', async () => {
    await svc.update('u1', 'r1', { isActive: false });
    const calls = prisma.expense.deleteMany.mock.calls.map((c: any) => c[0]);
    const removed = calls.map((c: any) => c.where.fixedExpenseCompetence);
    expect(removed).toHaveLength(13);
    expect(removed[0]).toBe('2026-09');
    expect(removed[12]).toBe('2027-09');
    // so intocadas e nao pagas: filtro por valores da regra, isPaid=false, escopo por usuario
    expect(calls[0].where).toMatchObject({
      userId: 'u1',
      fixedExpenseId: 'r1',
      isPaid: false,
      item: 'Aluguel',
      amount: 100,
      date: d('2026-09-05'),
    });
    // pausada: ensure nao recria
    expect(prisma.expense.createMany).not.toHaveBeenCalled();
  });

  it('flag desligada: editar nao propaga nem materializa', async () => {
    delete process.env.FIXED_EXPENSES_AUTOGEN;
    await svc.update('u1', 'r1', { amount: 150, isActive: false });
    expect(prisma.expense.updateMany).not.toHaveBeenCalled();
    expect(prisma.expense.deleteMany).not.toHaveBeenCalled();
    expect(prisma.expense.createMany).not.toHaveBeenCalled();
  });

  it('flag desligada: excluir regra nao remove ocorrencias (so a regra)', async () => {
    delete process.env.FIXED_EXPENSES_AUTOGEN;
    await svc.remove('u1', 'r1');
    const ops = (prisma.$transaction.mock.calls[0] as any)[0] as unknown[];
    expect(ops).toHaveLength(1);
    expect(prisma.expense.deleteMany).not.toHaveBeenCalled();
  });

  it('excluir regra: $transaction em array com limpeza das intocadas (>= mes corrente) ANTES do delete', async () => {
    await svc.remove('u1', 'r1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = (prisma.$transaction.mock.calls[0] as any)[0] as unknown[];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops).toHaveLength(14); // 13 competencias (>= mes corrente) + delete da regra
    const cleanupComps = prisma.expense.deleteMany.mock.calls.map(
      (c: any) => c[0].where.fixedExpenseCompetence,
    );
    expect(cleanupComps[0]).toBe('2026-09'); // inclui o mes corrente
    expect(cleanupComps).toHaveLength(13);
    expect(prisma.fixedExpense.deleteMany).toHaveBeenCalledWith({
      where: { id: 'r1', userId: 'u1' },
    });
  });
});
