/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
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
const today = `${NOW}-10`;

describe('Metas de economia (e2e, banco local)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: { id: string; token: string }[] = [];
  const auth = (i: number) => ({ Authorization: `Bearer ${users[i].token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    assertLocal(process.env.DATABASE_URL);
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
      const email = `e2e-savings-${RUN}-${n}@pit.local`;
      await http()
        .post('/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      const login = await http()
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(201);
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      users.push({ id: u.id, token: login.body.accessToken });
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    await app.close();
  });

  const createGoal = (i: number, body: object = {}) =>
    http()
      .post('/savings-goals')
      .set(auth(i))
      .send({
        name: 'Viagem',
        targetAmount: 1200,
        targetDate: `${at(11)}-28`,
        ...body,
      });
  const move = (i: number, id: string, body: object) =>
    http().post(`/savings-goals/${id}/movements`).set(auth(i)).send(body);

  it('criar devolve o calculo: 12 meses => R$ 100/mes', async () => {
    const r = await createGoal(0).expect(201);
    expect(r.body.progress).toMatchObject({
      saved: 0,
      monthsLeft: 12,
      monthlySuggested: 100,
      leftThisMonth: 100,
      status: 'on_track',
    });
  });

  it('aporte e retirada atualizam o guardado; retirar mais que o guardado => 400', async () => {
    const g = await createGoal(0, { initialAmount: 200 }).expect(201);
    const a = await move(0, g.body.id, {
      type: 'DEPOSIT',
      amount: 50,
      date: today,
    }).expect(201);
    expect(a.body.progress.saved).toBe(250);
    expect(a.body.progress.savedThisMonth).toBe(50);

    await move(0, g.body.id, {
      type: 'WITHDRAW',
      amount: 251,
      date: today,
    }).expect(400);
    const w = await move(0, g.body.id, {
      type: 'WITHDRAW',
      amount: 30,
      date: today,
    }).expect(201);
    expect(w.body.progress.saved).toBe(220);
    expect(w.body.movements).toHaveLength(2);
  });

  it('excluir aporte usado por retirada => 400; excluir a retirada antes funciona', async () => {
    const g = await createGoal(0).expect(201);
    const a = await move(0, g.body.id, {
      type: 'DEPOSIT',
      amount: 100,
      date: today,
    }).expect(201);
    const depositId = a.body.movements[0].id;
    const w = await move(0, g.body.id, {
      type: 'WITHDRAW',
      amount: 80,
      date: today,
    }).expect(201);
    const withdrawId = w.body.movements.find(
      (m: { type: string }) => m.type === 'WITHDRAW',
    ).id;

    await http()
      .delete(`/savings-goals/${g.body.id}/movements/${depositId}`)
      .set(auth(0))
      .expect(400);
    await http()
      .delete(`/savings-goals/${g.body.id}/movements/${withdrawId}`)
      .set(auth(0))
      .expect(200);
    const r = await http()
      .delete(`/savings-goals/${g.body.id}/movements/${depositId}`)
      .set(auth(0))
      .expect(200);
    expect(r.body.progress.saved).toBe(0);
  });

  it('prazo antes do mes atual => 400 (criar e editar)', async () => {
    await createGoal(0, { targetDate: `${at(-1)}-28` }).expect(400);
    const g = await createGoal(0).expect(201);
    await http()
      .put(`/savings-goals/${g.body.id}`)
      .set(auth(0))
      .send({ targetDate: `${at(-2)}-01` })
      .expect(400);
    const ok = await http()
      .put(`/savings-goals/${g.body.id}`)
      .set(auth(0))
      .send({ targetDate: `${at(5)}-01`, targetAmount: 600 })
      .expect(200);
    expect(ok.body.progress.monthlySuggested).toBe(100);
  });

  it('outro usuario nao ve, nao altera, nao movimenta e nao exclui', async () => {
    const g = await createGoal(0, { name: 'Privada' }).expect(201);
    const list = await http().get('/savings-goals').set(auth(1)).expect(200);
    expect(list.body).toEqual([]);
    await http()
      .put(`/savings-goals/${g.body.id}`)
      .set(auth(1))
      .send({ name: 'x' })
      .expect(404);
    await move(1, g.body.id, {
      type: 'DEPOSIT',
      amount: 10,
      date: today,
    }).expect(404);
    await http().delete(`/savings-goals/${g.body.id}`).set(auth(1)).expect(404);
  });

  it('excluir a meta remove as movimentacoes', async () => {
    const g = await createGoal(0).expect(201);
    await move(0, g.body.id, {
      type: 'DEPOSIT',
      amount: 10,
      date: today,
    }).expect(201);
    await http().delete(`/savings-goals/${g.body.id}`).set(auth(0)).expect(200);
    expect(
      await prisma.savingsMovement.count({ where: { goalId: g.body.id } }),
    ).toBe(0);
  });

  it('emprestimo: parcelas viram despesas; pagas voltam para a meta com juros', async () => {
    const g = await createGoal(0, {
      name: 'Reserva',
      targetAmount: 6000,
      initialAmount: 3000,
      isEmergencyFund: true,
    }).expect(201);
    await http()
      .post(`/savings-goals/${g.body.id}/loans`)
      .set(auth(0))
      .send({
        amount: 3000.01,
        monthlyRate: 1,
        installments: 6,
        firstDueDate: `${at(1)}-10`,
      })
      .expect(400);

    const r = await http()
      .post(`/savings-goals/${g.body.id}/loans`)
      .set(auth(0))
      .send({
        amount: 1000,
        monthlyRate: 1,
        installments: 6,
        firstDueDate: `${at(1)}-10`,
      })
      .expect(201);
    expect(r.body.progress.saved).toBe(2000);
    expect(r.body.progress.pendingRepayment).toBeCloseTo(1035.3, 2);
    const loan = r.body.loans[0];
    expect(Number(loan.installmentAmount)).toBe(172.55);
    expect(loan).toMatchObject({ paidCount: 0, remainingCount: 6 });

    const expenses = await prisma.expense.findMany({
      where: { installmentGroupId: loan.installmentGroupId },
      orderBy: { installmentNumber: 'asc' },
    });
    expect(expenses).toHaveLength(6);
    expect(expenses[0].item).toBe('1/6 - Empréstimo da reserva');

    // Pagar a 1a parcela (como em Despesas) devolve o valor para a meta.
    await http()
      .put(`/expenses/${expenses[0].id}`)
      .set(auth(0))
      .send({ isPaid: true })
      .expect(200);
    const after = await http().get('/savings-goals').set(auth(0)).expect(200);
    const mine = after.body.find((x: { id: string }) => x.id === g.body.id);
    expect(mine.progress.saved).toBeCloseTo(2172.55, 2);
    expect(mine.loans[0]).toMatchObject({ paidCount: 1, remainingCount: 5 });
    expect(mine.loans[0].nextInstallment.number).toBe(2);

    // Com parcela paga nao cancela; outro usuario nao enxerga.
    await http()
      .delete(`/savings-goals/${g.body.id}/loans/${loan.id}`)
      .set(auth(0))
      .expect(400);
    await http()
      .delete(`/savings-goals/${g.body.id}/loans/${loan.id}`)
      .set(auth(1))
      .expect(404);
  });

  it('cancelar emprestimo sem parcela paga remove as despesas e devolve o valor', async () => {
    const g = await createGoal(0, { initialAmount: 500 }).expect(201);
    const r = await http()
      .post(`/savings-goals/${g.body.id}/loans`)
      .set(auth(0))
      .send({
        amount: 300,
        monthlyRate: 0,
        installments: 3,
        firstDueDate: `${at(0)}-28`,
      })
      .expect(201);
    const loan = r.body.loans[0];
    expect(Number(loan.installmentAmount)).toBe(100);
    const del = await http()
      .delete(`/savings-goals/${g.body.id}/loans/${loan.id}`)
      .set(auth(0))
      .expect(200);
    expect(del.body.progress.saved).toBe(500);
    expect(
      await prisma.expense.count({
        where: { installmentGroupId: loan.installmentGroupId },
      }),
    ).toBe(0);
  });

  it('emprestimo: validacao de taxa, parcelas e vencimento', async () => {
    const g = await createGoal(0, { initialAmount: 500 }).expect(201);
    const send = (body: object) =>
      http()
        .post(`/savings-goals/${g.body.id}/loans`)
        .set(auth(0))
        .send({
          amount: 100,
          monthlyRate: 1,
          installments: 3,
          firstDueDate: `${at(1)}-10`,
          ...body,
        });
    await send({ monthlyRate: 21 }).expect(400);
    await send({ monthlyRate: -1 }).expect(400);
    await send({ installments: 0 }).expect(400);
    await send({ installments: 49 }).expect(400);
    await send({ firstDueDate: `${at(-1)}-10` }).expect(400);
  });

  it('validacao: valor <= 0, tipo invalido e campos extras => 400', async () => {
    await createGoal(0, { targetAmount: 0 }).expect(400);
    const g = await createGoal(0).expect(201);
    await move(0, g.body.id, { type: 'X', amount: 1, date: today }).expect(400);
    await move(0, g.body.id, {
      type: 'DEPOSIT',
      amount: 1,
      date: today,
      userId: users[1].id,
    }).expect(400);
  });
});
