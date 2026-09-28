/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// Integracao contra Postgres LOCAL. Rodar SOMENTE via `npm run dev:test:e2e`.
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertLocal } = require('../dev-env/guard.cjs');

const RUN = Date.now();
const PASSWORD = 'e2e-pass-123';
const SECRET_NAME = `Segredo-${RUN}`;

describe('Posse de tagId/creditorId (e2e, banco local)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: { id: string; token: string }[] = [];
  const auth = (i: number) => ({ Authorization: `Bearer ${users[i].token}` });
  const http = () => request(app.getHttpServer());
  let aTag: string;
  let aCreditor: string;
  let bTag: string;
  let bCreditor: string;

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
      const email = `e2e-own-${RUN}-${n}@pit.local`;
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
    const tagOf = async (i: number) =>
      (
        await prisma.tag.findFirstOrThrow({
          where: { userId: users[i].id, type: 'EXPENSE' },
        })
      ).id;
    aTag = (
      await prisma.tag.create({
        data: { name: SECRET_NAME, type: 'EXPENSE', userId: users[0].id },
      })
    ).id;
    bTag = await tagOf(1);
    aCreditor = (
      await http()
        .post('/creditors')
        .set(auth(0))
        .send({ name: SECRET_NAME })
        .expect(201)
    ).body.id;
    bCreditor = (
      await http()
        .post('/creditors')
        .set(auth(1))
        .send({ name: `Meu-${RUN}` })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    await app.close();
  });

  const countB = () => prisma.expense.count({ where: { userId: users[1].id } });
  const noLeak = (res: { text: string }) =>
    expect(res.text).not.toContain(SECRET_NAME);

  it('despesa: B nao usa tag/credor de A (criar/editar); A e B usam os proprios', async () => {
    const before = await countB();
    const body = { item: 'Mercado', amount: 10, date: '2026-09-10' };

    let res = await http()
      .post('/expenses')
      .set(auth(1))
      .send({ ...body, tagId: aTag })
      .expect(400);
    noLeak(res);
    res = await http()
      .post('/expenses')
      .set(auth(1))
      .send({ ...body, creditorId: aCreditor })
      .expect(400);
    noLeak(res);
    expect(await countB()).toBe(before);

    const own = await http()
      .post('/expenses')
      .set(auth(1))
      .send({ ...body, tagId: bTag, creditorId: bCreditor })
      .expect(201);
    expect(own.body.tagId).toBe(bTag);
    const noRefs = await http()
      .post('/expenses')
      .set(auth(1))
      .send(body)
      .expect(201);

    res = await http()
      .put(`/expenses/${noRefs.body.id}`)
      .set(auth(1))
      .send({ tagId: aTag })
      .expect(400);
    noLeak(res);
    res = await http()
      .put(`/expenses/${noRefs.body.id}`)
      .set(auth(1))
      .send({ creditorId: aCreditor })
      .expect(400);
    noLeak(res);
    const stored = await prisma.expense.findUniqueOrThrow({
      where: { id: noRefs.body.id },
    });
    expect(stored.tagId).toBeNull();
    expect(stored.creditorId).toBeNull();

    const ok = await http()
      .put(`/expenses/${noRefs.body.id}`)
      .set(auth(1))
      .send({ tagId: bTag, isPaid: true })
      .expect(200);
    expect(ok.body).toMatchObject({
      id: noRefs.body.id,
      tagId: bTag,
      isPaid: true,
    });
    const cleared = await http()
      .put(`/expenses/${noRefs.body.id}`)
      .set(auth(1))
      .send({ tagId: null })
      .expect(200);
    expect(cleared.body.tagId).toBeNull();

    // dono legitimo (A) segue usando os proprios
    await http()
      .post('/expenses')
      .set(auth(0))
      .send({ ...body, tagId: aTag, creditorId: aCreditor })
      .expect(201);
  });

  it('despesa de outro usuario: editar/excluir => 404 e nada muda', async () => {
    const mine = await http()
      .post('/expenses')
      .set(auth(0))
      .send({ item: 'DoA', amount: 5, date: '2026-09-10' })
      .expect(201);
    await http()
      .put(`/expenses/${mine.body.id}`)
      .set(auth(1))
      .send({ item: 'Hack' })
      .expect(404);
    await http().delete(`/expenses/${mine.body.id}`).set(auth(1)).expect(404);
    const stored = await prisma.expense.findUniqueOrThrow({
      where: { id: mine.body.id },
    });
    expect(stored.item).toBe('DoA');
  });

  it('parcelas: B nao usa tag/credor de A; proprios funcionam', async () => {
    const before = await countB();
    const inst = {
      item: 'Sofa',
      amount: 10,
      startDate: '2026-09-01T00:00:00.000Z',
      totalInstallments: 3,
    };
    let res = await http()
      .post('/expenses/installments')
      .set(auth(1))
      .send({ ...inst, tagId: aTag })
      .expect(400);
    noLeak(res);
    res = await http()
      .post('/expenses/installments')
      .set(auth(1))
      .send({ ...inst, creditorId: aCreditor })
      .expect(400);
    noLeak(res);
    expect(await countB()).toBe(before);

    const ok = await http()
      .post('/expenses/installments')
      .set(auth(1))
      .send({ ...inst, tagId: bTag, creditorId: bCreditor })
      .expect(201);
    expect(ok.body.count).toBe(3);

    res = await http()
      .put(`/expenses/group/${ok.body.groupId}`)
      .set(auth(1))
      .send({ tagId: aTag })
      .expect(400);
    noLeak(res);
    await http()
      .put(`/expenses/group/${ok.body.groupId}`)
      .set(auth(1))
      .send({ tagId: bTag })
      .expect(200);
  });

  it('receita: B nao usa tag de A (criar/editar); propria funciona', async () => {
    const body = { source: 'Salario', amount: 100, date: '2026-09-05' };
    let res = await http()
      .post('/incomes')
      .set(auth(1))
      .send({ ...body, tagId: aTag })
      .expect(400);
    noLeak(res);
    const own = await http()
      .post('/incomes')
      .set(auth(1))
      .send({ ...body, tagId: bTag })
      .expect(201);
    expect(own.body.tagId).toBe(bTag);
    res = await http()
      .put(`/incomes/${own.body.id}`)
      .set(auth(1))
      .send({ tagId: aTag })
      .expect(400);
    noLeak(res);
    const stored = await prisma.income.findUniqueOrThrow({
      where: { id: own.body.id },
    });
    expect(stored.tagId).toBe(bTag);
    const ok = await http()
      .put(`/incomes/${own.body.id}`)
      .set(auth(1))
      .send({ source: 'Novo', tagId: null })
      .expect(200);
    expect(ok.body).toMatchObject({ source: 'Novo', tagId: null });
    await http()
      .put(`/incomes/${own.body.id}`)
      .set(auth(0))
      .send({ source: 'Hack' })
      .expect(404);
    await http().delete(`/incomes/${own.body.id}`).set(auth(0)).expect(404);
  });
});
