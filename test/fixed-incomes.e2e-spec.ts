/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
// Integracao contra Postgres LOCAL. Rodar SOMENTE via `npm run dev:test:e2e` (guard + DATABASE_URL local).
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  addMonths,
  currentMonthKey,
} from '../src/fixed-expenses/occurrence-utils';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertLocal } = require('../dev-env/guard.cjs');

const RUN = Date.now();
const PASSWORD = 'e2e-pass-123';
const NOW = currentMonthKey();
const at = (n: number) => addMonths(NOW, n);

describe('Receitas fixas: geracao automatica e reajustes (e2e, banco local)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: { id: string; email: string; token: string }[] = [];
  const auth = (i: number) => ({ Authorization: `Bearer ${users[i].token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    assertLocal(process.env.DATABASE_URL);
    process.env.FIXED_INCOMES_AUTOGEN = 'true';
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

    for (const n of [1, 2]) {
      const email = `e2e-fixed-income-${RUN}-${n}@pit.local`;
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

  afterAll(async () => {
    delete process.env.FIXED_INCOMES_AUTOGEN;
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    await app.close();
  });

  const createRule = (i: number, body: object) =>
    http()
      .post('/fixed-incomes')
      .set(auth(i))
      .send({
        name: 'Salario',
        amount: 5000,
        dayOfMonth: 5,
        startDate: '2026-01-01',
        ...body,
      });
  const rows = (ruleId: string) =>
    prisma.income.findMany({
      where: { fixedIncomeId: ruleId },
      orderBy: { fixedIncomeCompetence: 'asc' },
    });
  const amounts = async (ruleId: string) =>
    Object.fromEntries(
      (await rows(ruleId)).map((r) => [
        r.fixedIncomeCompetence,
        Number(r.amount),
      ]),
    );
  const put = (i: number, id: string, body: object) =>
    http().put(`/fixed-incomes/${id}`).set(auth(i)).send(body);

  it('criar gera do mes corrente ate +12 e aparece em GET /incomes', async () => {
    const r = await createRule(0, { name: 'Salario A' }).expect(201);
    expect(r.body.adjustments).toEqual([]);
    expect(await rows(r.body.id)).toHaveLength(13);
    const list = await http().get('/incomes').set(auth(0)).expect(200);
    const mine = list.body.filter(
      (i: { fixedIncomeId: string }) => i.fixedIncomeId === r.body.id,
    );
    expect(mine).toHaveLength(13);
  });

  it('aumento a partir de um mes futuro muda so dali em diante e fica no historico', async () => {
    const r = await createRule(0, { name: 'Salario B' }).expect(201);
    const upd = await put(0, r.body.id, {
      amount: 5500,
      amountEffectiveFrom: at(3),
    }).expect(200);
    expect(Number(upd.body.amount)).toBe(5000);
    expect(upd.body.adjustments).toHaveLength(1);
    expect(upd.body.adjustments[0].effectiveFrom).toBe(at(3));

    const a = await amounts(r.body.id);
    expect(a[at(0)]).toBe(5000);
    expect(a[at(2)]).toBe(5000);
    expect(a[at(3)]).toBe(5500);
    expect(a[at(12)]).toBe(5500);
  });

  it('lancamento editado a mao nao e sobrescrito pelo reajuste', async () => {
    const r = await createRule(0, { name: 'Salario C' }).expect(201);
    const target = (await rows(r.body.id)).find(
      (x) => x.fixedIncomeCompetence === at(4),
    )!;
    await http()
      .put(`/incomes/${target.id}`)
      .set(auth(0))
      .send({ amount: 5100 })
      .expect(200);
    await put(0, r.body.id, {
      amount: 6000,
      amountEffectiveFrom: at(1),
    }).expect(200);
    const a = await amounts(r.body.id);
    expect(a[at(0)]).toBe(5000);
    expect(a[at(1)]).toBe(6000);
    expect(a[at(4)]).toBe(5100);
  });

  it('corrigir desde o inicio troca a base e limpa o historico', async () => {
    const r = await createRule(0, { name: 'Salario D' }).expect(201);
    await put(0, r.body.id, {
      amount: 5500,
      amountEffectiveFrom: at(2),
    }).expect(200);
    const upd = await put(0, r.body.id, { amount: 4800 }).expect(200);
    expect(Number(upd.body.amount)).toBe(4800);
    expect(upd.body.adjustments).toEqual([]);
    const a = await amounts(r.body.id);
    expect(Object.values(a).every((v) => v === 4800)).toBe(true);
  });

  it('excluir uma ocorrencia pula o mes (nao ressuscita)', async () => {
    const r = await createRule(0, { name: 'Contrato E' }).expect(201);
    const target = (await rows(r.body.id)).find(
      (x) => x.fixedIncomeCompetence === at(1),
    )!;
    await http().delete(`/incomes/${target.id}`).set(auth(0)).expect(200);
    await put(0, r.body.id, { name: 'Contrato E2' }).expect(200);
    await http().get('/incomes').set(auth(0)).expect(200);
    const comps = (await rows(r.body.id)).map((x) => x.fixedIncomeCompetence);
    expect(comps).not.toContain(at(1));
    expect(comps).toHaveLength(12);
  });

  it('pausar remove as futuras intocadas; excluir a regra remove as restantes', async () => {
    const r = await createRule(0, { name: 'Contrato F' }).expect(201);
    await put(0, r.body.id, { isActive: false }).expect(200);
    expect(await rows(r.body.id)).toHaveLength(0);
    await put(0, r.body.id, { isActive: true }).expect(200);
    expect(await rows(r.body.id)).toHaveLength(13);
    await http().delete(`/fixed-incomes/${r.body.id}`).set(auth(0)).expect(200);
    expect(
      await prisma.income.count({
        where: { source: 'Contrato F', userId: users[0].id },
      }),
    ).toBe(0);
  });

  it('outro usuario nao ve nem altera a regra; tag alheia e recusada', async () => {
    const r = await createRule(0, { name: 'Privada' }).expect(201);
    await put(1, r.body.id, { amount: 1 }).expect(404);
    await http().delete(`/fixed-incomes/${r.body.id}`).set(auth(1)).expect(404);
    const list = await http().get('/fixed-incomes').set(auth(1)).expect(200);
    expect(list.body).toEqual([]);

    const tag = await prisma.tag.create({
      data: { name: `t-${RUN}`, type: 'INCOME', userId: users[0].id },
    });
    await createRule(1, { tagId: tag.id }).expect(400);
  });

  it('vigencia sem valor ou em formato invalido => 400', async () => {
    const r = await createRule(0, { name: 'Valida' }).expect(201);
    await put(0, r.body.id, { amountEffectiveFrom: at(1) }).expect(400);
    await put(0, r.body.id, {
      amount: 10,
      amountEffectiveFrom: '2026-13',
    }).expect(400);
  });
});
