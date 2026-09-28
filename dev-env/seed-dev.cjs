// Seed sintetico MINIMO. Idempotente. So roda com DATABASE_URL local (guard).
const path = require('path');
const { assertLocal } = require('./guard.cjs');
assertLocal(process.env.DATABASE_URL);

const req = (m) => require(path.join(__dirname, '..', 'node_modules', m));
const bcrypt = req('bcrypt');
const { Pool } = req('pg');
const { PrismaClient, TagType } = req('@prisma/client');
const { PrismaPg } = req('@prisma/adapter-pg');

const USERS = [
  { email: 'dev1@pit.local', password: 'dev123456' },
  { email: 'dev2@pit.local', password: 'dev123456' },
];
const EXPENSE_TAGS = ['Moradia', 'Utilitario', 'Lazer'];
const INCOME_TAGS = ['Salario'];
const CREDITORS = ['Banco Ficticio', 'Imobiliaria Ficticia'];
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    for (const u of USERS) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash },
        create: { email: u.email, passwordHash },
      });
      const tags = {};
      for (const name of EXPENSE_TAGS) {
        tags[name] = await prisma.tag.upsert({
          where: { userId_name_type: { userId: user.id, name, type: TagType.EXPENSE } },
          update: {},
          create: { name, type: TagType.EXPENSE, userId: user.id },
        });
      }
      for (const name of INCOME_TAGS) {
        await prisma.tag.upsert({
          where: { userId_name_type: { userId: user.id, name, type: TagType.INCOME } },
          update: {},
          create: { name, type: TagType.INCOME, userId: user.id },
        });
      }
      const creditors = [];
      for (const name of CREDITORS) {
        creditors.push(
          await prisma.creditor.upsert({
            where: { userId_name: { userId: user.id, name } },
            update: {},
            create: { name, userId: user.id },
          }),
        );
      }
      if ((await prisma.fixedExpense.count({ where: { userId: user.id } })) === 0) {
        await prisma.fixedExpense.createMany({
          data: [
            { name: 'Aluguel', amount: 1500, dayOfMonth: 5, startDate: utc(2026, 1, 1), userId: user.id, tagId: tags.Moradia.id, creditorId: creditors[1].id },
            { name: 'Internet', amount: 99.9, dayOfMonth: 31, startDate: utc(2026, 3, 1), userId: user.id, tagId: tags.Utilitario.id },
            { name: 'Streaming (pausada)', amount: 39.9, dayOfMonth: 10, startDate: utc(2026, 1, 1), isActive: false, userId: user.id, tagId: tags.Lazer.id },
          ],
        });
      }
      if ((await prisma.expense.count({ where: { userId: user.id } })) === 0) {
        await prisma.expense.createMany({
          data: [
            { item: 'Mercado', amount: 320.5, date: utc(2026, 9, 12), userId: user.id, creditorId: creditors[0].id },
            { item: 'Cinema', amount: 60, date: utc(2026, 9, 20), isPaid: true, userId: user.id, tagId: tags.Lazer.id },
          ],
        });
      }
      console.log(`[seed] ${u.email} ok`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
