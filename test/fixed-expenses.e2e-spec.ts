/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// Integracao contra Postgres LOCAL. Rodar SOMENTE via `npm run dev:test:e2e` (guard + DATABASE_URL local).
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OccurrencesService } from '../src/fixed-expenses/occurrences.service';
import {
  addMonths,
  currentMonthKey,
  occurrenceDate,
} from '../src/fixed-expenses/occurrence-utils';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertLocal } = require('../dev-env/guard.cjs');

const RUN = Date.now();
const PASSWORD = 'e2e-pass-123';
const NOW = currentMonthKey();
const at = (n: number) => addMonths(NOW, n);

describe('Despesas fixas: geracao automatica (e2e, banco local)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let occ: OccurrencesService;
  const users: { id: string; email: string; token: string }[] = [];
  const auth = (i: number) => ({ Authorization: `Bearer ${users[i].token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    assertLocal(process.env.DATABASE_URL);
    process.env.FIXED_EXPENSES_AUTOGEN = 'true';
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    occ = app.get(OccurrencesService);

    for (const n of [1, 2]) {
      const email = `e2e-fixed-${RUN}-${n}@pit.local`;
      await http()
        .post('/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      const login = await http()
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(201);
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      users.push({ id: u.id, email, token: login.body.accessToken });
    }
  });

  beforeEach(() => {
    process.env.FIXED_EXPENSES_AUTOGEN = 'true';
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    delete process.env.FIXED_EXPENSES_AUTOGEN;
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    await app.close();
  });

  const createRule = (i: number, body: object) =>
    http()
      .post('/fixed-expenses')
      .set(auth(i))
      .send({
        name: 'Regra',
        amount: 100,
        dayOfMonth: 5,
        startDate: '2026-01-01',
        ...body,
      });
  const rows = (ruleId: string) =>
    prisma.expense.findMany({
      where: { fixedExpenseId: ruleId },
      orderBy: { fixedExpenseCompetence: 'asc' },
    });
  const comps = async (ruleId: string) =>
    (await rows(ruleId)).map((r) => r.fixedExpenseCompetence);
  const put = (i: number, id: string, body: object) =>
    http().put(`/fixed-expenses/${id}`).set(auth(i)).send(body);
  const getExpenses = (i: number) => http().get('/expenses').set(auth(i));
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_v, k) => at(from + k));

  it('criar regra sem fim: mes corrente ate +12 aparece sem outra acao, sem backfill', async () => {
    const r = await createRule(0, { name: 'SemFim' }).expect(201);
    expect(r.body.endDate).toBeNull();
    expect(await comps(r.body.id)).toEqual(range(0, 12));
    const list = await getExpenses(0).expect(200);
    const mine = list.body.filter(
      (e: { fixedExpenseId: string }) => e.fixedExpenseId === r.body.id,
    );
    expect(mine).toHaveLength(13);
    expect(mine.every((e: { isPaid: boolean }) => e.isPaid === false)).toBe(
      true,
    );
  });

  it('com endDate a janela para no mes do fim; fim passado nao gera; startDate futura gera so a partir dela', async () => {
    const withEnd = await createRule(0, {
      name: 'ComFim',
      endDate: `${at(2)}-20`,
    }).expect(201);
    expect(await comps(withEnd.body.id)).toEqual(range(0, 2));

    const past = await createRule(0, {
      name: 'FimPassado',
      startDate: '2026-01-01',
      endDate: '2026-02-10',
    }).expect(201);
    expect(await comps(past.body.id)).toEqual([]);

    const future = await createRule(0, {
      name: 'Futura',
      startDate: `${at(3)}-15`,
    }).expect(201);
    expect(await comps(future.body.id)).toEqual(range(3, 12));
  });

  it('dia 31 clampado em meses curtos (UTC)', async () => {
    const r = await createRule(0, { name: 'Dia31', dayOfMonth: 31 }).expect(
      201,
    );
    for (const row of await rows(r.body.id)) {
      expect(row.date).toEqual(
        occurrenceDate(row.fixedExpenseCompetence as string, 31),
      );
    }
  });

  it('10 GET /expenses paralelos (e 2 "processos") => zero duplicatas', async () => {
    const r = await createRule(0, { name: 'Paralela' }).expect(201);
    await prisma.expense.deleteMany({ where: { fixedExpenseId: r.body.id } });
    occ.invalidate(users[0].id);
    const second = new OccurrencesService(prisma); // simula 2o processo (sem memo/coalescencia compartilhados)
    await Promise.all([
      ...Array.from({ length: 10 }, () => getExpenses(0).expect(200)),
      second.ensure(users[0].id),
      second.ensure(users[0].id, r.body.id),
    ]);
    const all = await rows(r.body.id);
    expect(all).toHaveLength(13);
    expect(new Set(all.map((x) => x.fixedExpenseCompetence)).size).toBe(13);
  });

  it('legada no mes nao duplica', async () => {
    const r = await createRule(0, {
      name: 'Legada',
      startDate: `${at(1)}-01`,
    }).expect(201);
    await prisma.expense.deleteMany({ where: { fixedExpenseId: r.body.id } });
    await prisma.expense.create({
      data: {
        item: 'Legada',
        amount: 100,
        date: new Date(`${at(1)}-10T03:00:00.000Z`),
        userId: users[0].id,
        fixedExpenseId: r.body.id,
      },
    });
    occ.invalidate(users[0].id);
    await getExpenses(0).expect(200);
    const all = await rows(r.body.id);
    expect(
      all.filter((x) => x.date.toISOString().startsWith(at(1))),
    ).toHaveLength(1);
    expect(all).toHaveLength(12); // legada + NOW+2..NOW+12
  });

  it('editar valor/dia/nome atualiza so intocadas; paga e editada nunca mudam', async () => {
    const r = await createRule(0, { name: 'Edita', amount: 100 }).expect(201);
    const all = await rows(r.body.id);
    await http()
      .put(`/expenses/${all[1].id}`)
      .set(auth(0))
      .send({ isPaid: true })
      .expect(200);
    await http()
      .put(`/expenses/${all[2].id}`)
      .set(auth(0))
      .send({ amount: 999 })
      .expect(200);

    await put(0, r.body.id, {
      amount: 150,
      dayOfMonth: 31,
      name: 'Edita2',
    }).expect(200);
    const after = await rows(r.body.id);
    const by = Object.fromEntries(
      after.map((x) => [x.fixedExpenseCompetence, x]),
    );
    expect(Number(by[at(0)].amount)).toBe(150);
    expect(by[at(0)].item).toBe('Edita2');
    expect(by[at(0)].date).toEqual(occurrenceDate(at(0), 31));
    expect(Number(by[at(1)].amount)).toBe(100); // paga
    expect(by[at(1)].item).toBe('Edita');
    expect(Number(by[at(2)].amount)).toBe(999); // editada
    expect(Number(by[at(3)].amount)).toBe(150);
    expect(after).toHaveLength(13);
  });

  it('endDate remove intocadas apos o fim (preserva paga); limpar fim recria', async () => {
    const r = await createRule(0, { name: 'Fim' }).expect(201);
    const paid = (await rows(r.body.id))[5];
    await http()
      .put(`/expenses/${paid.id}`)
      .set(auth(0))
      .send({ isPaid: true })
      .expect(200);
    await put(0, r.body.id, { endDate: `${at(3)}-28` }).expect(200);
    expect(await comps(r.body.id)).toEqual([...range(0, 3), at(5)]);
    await put(0, r.body.id, { endDate: null }).expect(200);
    expect(await comps(r.body.id)).toEqual(range(0, 12));
  });

  it('endDate antes do mes corrente mantem passadas e remove futuras', async () => {
    const r = await createRule(0, { name: 'FimAntes' }).expect(201);
    const past = await prisma.expense.create({
      data: {
        item: 'FimAntes',
        amount: 100,
        date: occurrenceDate(at(-2), 5),
        userId: users[0].id,
        fixedExpenseId: r.body.id,
        fixedExpenseCompetence: at(-2),
      },
    });
    await put(0, r.body.id, { endDate: `${at(-1)}-10` }).expect(200);
    expect((await rows(r.body.id)).map((x) => x.id)).toEqual([past.id]);
  });

  it('startDate movida para depois remove intocadas anteriores', async () => {
    const r = await createRule(0, { name: 'Inicio' }).expect(201);
    await put(0, r.body.id, { startDate: `${at(4)}-01` }).expect(200);
    expect(await comps(r.body.id)).toEqual(range(4, 12));
  });

  it('pausar remove intocadas nao pagas inclusive a do mes corrente; reativar recria', async () => {
    const r = await createRule(0, { name: 'Pausa' }).expect(201);
    await put(0, r.body.id, { isActive: false }).expect(200);
    expect(await comps(r.body.id)).toEqual([]);
    await getExpenses(0).expect(200);
    expect(await comps(r.body.id)).toEqual([]); // pausada nao recria
    await put(0, r.body.id, { isActive: true }).expect(200);
    expect(await comps(r.body.id)).toEqual(range(0, 12)); // recria inclusive a do mes corrente
  });

  it('pausar mantem a do mes corrente PAGA ou EDITADA (e paga futura)', async () => {
    const r = await createRule(0, { name: 'PausaProt' }).expect(201);
    const all = await rows(r.body.id);
    await http()
      .put(`/expenses/${all[0].id}`)
      .set(auth(0))
      .send({ isPaid: true })
      .expect(200);
    await http()
      .put(`/expenses/${all[1].id}`)
      .set(auth(0))
      .send({ amount: 777 })
      .expect(200);
    await http()
      .put(`/expenses/${all[4].id}`)
      .set(auth(0))
      .send({ isPaid: true })
      .expect(200);
    await put(0, r.body.id, { isActive: false }).expect(200);
    expect(await comps(r.body.id)).toEqual([at(0), at(1), at(4)]);
  });

  it('excluir regra remove a do mes corrente intocada e nao deixa linha nao paga da regra', async () => {
    const r = await createRule(0, { name: 'ExcluiTudo' }).expect(201);
    await http()
      .delete(`/fixed-expenses/${r.body.id}`)
      .set(auth(0))
      .expect(200);
    const left = await prisma.expense.count({
      where: { userId: users[0].id, item: 'ExcluiTudo' },
    });
    expect(left).toBe(0);
  });

  it('excluir regra: remove intocadas (inclusive a do mes corrente); mantem paga e editada', async () => {
    const r = await createRule(0, { name: 'Exclui' }).expect(201);
    const all = await rows(r.body.id);
    await http()
      .put(`/expenses/${all[3].id}`)
      .set(auth(0))
      .send({ isPaid: true })
      .expect(200);
    await http()
      .put(`/expenses/${all[4].id}`)
      .set(auth(0))
      .send({ item: 'Manual' })
      .expect(200);
    await http()
      .delete(`/fixed-expenses/${r.body.id}`)
      .set(auth(0))
      .expect(200);
    const kept = await prisma.expense.findMany({
      where: {
        userId: users[0].id,
        fixedExpenseId: null,
        fixedExpenseCompetence: { in: range(0, 12) },
        item: { in: ['Exclui', 'Manual'] },
      },
      orderBy: { date: 'asc' },
    });
    expect(kept.map((x) => x.fixedExpenseCompetence)).toEqual([at(3), at(4)]);
  });

  it('excluir ocorrencia gerada nao a recria (lapide), nem apos pausar/reativar', async () => {
    const r = await createRule(0, { name: 'Lapide' }).expect(201);
    const target = (await rows(r.body.id))[2];
    await http().delete(`/expenses/${target.id}`).set(auth(0)).expect(200);
    occ.invalidate(users[0].id);
    await getExpenses(0).expect(200);
    const remaining = await comps(r.body.id);
    expect(remaining).not.toContain(target.fixedExpenseCompetence);
    expect(remaining).toHaveLength(12);
    const rule = await prisma.fixedExpense.findUniqueOrThrow({
      where: { id: r.body.id },
    });
    expect(rule.skippedCompetences).toEqual([target.fixedExpenseCompetence]);
    await put(0, r.body.id, { isActive: false }).expect(200);
    await put(0, r.body.id, { isActive: true }).expect(200);
    expect(await comps(r.body.id)).toHaveLength(12);
  });

  it('flag desligada: nada e criado nem propagado; ligar recupera', async () => {
    delete process.env.FIXED_EXPENSES_AUTOGEN;
    const r = await createRule(0, { name: 'FlagOff' }).expect(201);
    expect(await comps(r.body.id)).toEqual([]);
    occ.invalidate(users[0].id);
    await getExpenses(0).expect(200);
    expect(await comps(r.body.id)).toEqual([]);
    process.env.FIXED_EXPENSES_AUTOGEN = 'true';
    occ.invalidate(users[0].id);
    await getExpenses(0).expect(200);
    expect(await comps(r.body.id)).toEqual(range(0, 12));
  });

  it('teto por execucao: GETs seguidos completam o restante (sem esperar o TTL do memo)', async () => {
    process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS = '5';
    try {
      const ids: string[] = [];
      for (const name of ['TetoA', 'TetoB', 'TetoC']) {
        const r = await createRule(0, { name }).expect(201);
        ids.push(r.body.id);
      }
      const total = () =>
        prisma.expense.count({ where: { fixedExpenseId: { in: ids } } });
      expect(await total()).toBe(15); // 5 por criacao (teto)
      let last = 15;
      for (let i = 0; i < 6 && last < 39; i++) {
        await getExpenses(0).expect(200);
        const now = await total();
        expect(now).toBeGreaterThan(last); // cada GET avanca, sem memo adiando
        last = now;
      }
      expect(last).toBe(39);
    } finally {
      delete process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS;
    }
  });

  it('falha na materializacao nao quebra GET /expenses', async () => {
    jest.spyOn(occ, 'ensure').mockRejectedValue(new Error('boom'));
    const res = await getExpenses(0).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('usuario B nunca e afetado por regras do A', async () => {
    const r = await createRule(0, { name: 'DoA' }).expect(201);
    occ.invalidate(users[1].id);
    const listB = await getExpenses(1).expect(200);
    expect(
      listB.body.some(
        (e: { fixedExpenseId: string }) => e.fixedExpenseId === r.body.id,
      ),
    ).toBe(false);
    await put(1, r.body.id, { name: 'x' }).expect(404);
    await http()
      .delete(`/fixed-expenses/${r.body.id}`)
      .set(auth(1))
      .expect(404);
    const tag = await prisma.tag.findFirstOrThrow({
      where: { userId: users[0].id },
    });
    await createRule(1, { tagId: tag.id }).expect(400);
    expect(await comps(r.body.id)).toEqual(range(0, 12));
  });

  it('resumo de credores sem mes nao infla com futuras geradas', async () => {
    const cred = await http()
      .post('/creditors')
      .set(auth(0))
      .send({ name: `Credor ${RUN}` })
      .expect(201);
    await createRule(0, {
      name: 'ComCredor',
      amount: 40,
      creditorId: cred.body.id,
    }).expect(201);
    const summary = await http()
      .get('/creditors/summary')
      .set(auth(0))
      .expect(200);
    const c = summary.body.find((x: { id: string }) => x.id === cred.body.id);
    expect(c.unpaidAmount).toBe(40); // so o mes corrente
    expect(c.expenseCount).toBe(1);
  });

  it('validacoes: endDate<startDate, PUT mesclado, endDate:null limpa, whitelist', async () => {
    await createRule(0, {
      startDate: '2026-03-01',
      endDate: '2026-02-01',
    }).expect(400);
    const r = await createRule(0, {
      name: 'Put',
      startDate: '2026-03-01',
      endDate: '2026-06-30',
    }).expect(201);
    await put(0, r.body.id, { startDate: '2026-08-01' }).expect(400);
    const cleared = await put(0, r.body.id, { endDate: null }).expect(200);
    expect(cleared.body.endDate).toBeNull();
    await put(0, r.body.id, { userId: 'x' }).expect(400);
  });

  it('endpoint deprecado /generate com flag desligada nao escreve nada', async () => {
    delete process.env.FIXED_EXPENSES_AUTOGEN;
    const before = await prisma.expense.count({
      where: { userId: users[0].id },
    });
    const y = Number(NOW.slice(0, 4));
    const res = await http()
      .post(`/fixed-expenses/generate/${y}/${Number(NOW.slice(5))}`)
      .set(auth(0))
      .expect(201);
    expect(res.body).toEqual({ generated: 0, skipped: 0, expenses: [] });
    expect(await prisma.expense.count({ where: { userId: users[0].id } })).toBe(
      before,
    );
  });

  it('endpoint deprecado /generate: idempotente, valida mes/ano, sem limite de futuro', async () => {
    await http()
      .post('/fixed-expenses/generate/2026/13')
      .set(auth(0))
      .expect(400);
    await http()
      .post('/fixed-expenses/generate/2026/0')
      .set(auth(0))
      .expect(400);
    await http()
      .post('/fixed-expenses/generate/1999/5')
      .set(auth(0))
      .expect(400);
    const y = Number(NOW.slice(0, 4)) + 1;
    const g1 = await http()
      .post(`/fixed-expenses/generate/${y}/12`)
      .set(auth(0))
      .expect(201);
    const g2 = await http()
      .post(`/fixed-expenses/generate/${y}/12`)
      .set(auth(0))
      .expect(201);
    expect(g2.body.generated).toBe(0);
    expect(g1.body.generated + g1.body.skipped).toBeGreaterThan(0);
  });
});
