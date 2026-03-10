require('dotenv/config');

const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { PrismaClient, TagType } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const DEFAULT_USER = {
  email: 'teste@pitfinance.com',
  password: '123456',
};

const DEFAULT_INCOME_TAGS = ['Salario', 'Freelance', 'Investimentos', 'Outros'];
const DEFAULT_EXPENSE_TAGS = [
  'Alimentacao',
  'Moradia',
  'Transporte',
  'Utilitario',
  'Vestuario',
  'Conta',
  'Saude',
  'Educacao',
  'Lazer',
  'Outros',
];

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    const passwordHash = await bcrypt.hash(DEFAULT_USER.password, 10);

    const user = await prisma.user.upsert({
      where: { email: DEFAULT_USER.email },
      update: { passwordHash },
      create: { email: DEFAULT_USER.email, passwordHash },
    });

    await prisma.expense.deleteMany({ where: { userId: user.id } });
    await prisma.income.deleteMany({ where: { userId: user.id } });
    await prisma.tag.deleteMany({ where: { userId: user.id } });

    const tagData = [
      ...DEFAULT_INCOME_TAGS.map((name) => ({
        name,
        type: TagType.INCOME,
        userId: user.id,
      })),
      ...DEFAULT_EXPENSE_TAGS.map((name) => ({
        name,
        type: TagType.EXPENSE,
        userId: user.id,
      })),
    ];

    await prisma.tag.createMany({
      data: tagData,
      skipDuplicates: true,
    });

    const tags = await prisma.tag.findMany({
      where: { userId: user.id },
    });

    const tagByName = Object.fromEntries(tags.map((tag) => [tag.name, tag]));

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Função auxiliar para criar data de um mês específico
    function createDate(year, month, day) {
      return new Date(year, month, day);
    }

    const incomes = [];
    const expenses = [];

    // Dados para os últimos 12 meses (ano atual e anterior)
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const date = new Date(currentYear, currentMonth - monthOffset, 1);
      const year = date.getFullYear();
      const month = date.getMonth();

      // Receitas mensais
      // Salário (todo dia 5)
      incomes.push({
        source: 'Salario',
        amount: 5200.0 + Math.random() * 200 - 100, // Variação pequena
        date: createDate(year, month, 5),
        userId: user.id,
        tagId: tagByName.Salario?.id,
      });

      // Freelance (alguns meses)
      if (Math.random() > 0.3) {
        incomes.push({
          source: 'Freelance',
          amount: 1200.0 + Math.random() * 1200,
          date: createDate(year, month, 15 + Math.floor(Math.random() * 10)),
          userId: user.id,
          tagId: tagByName.Freelance?.id,
        });
      }

      // Investimentos (alguns meses)
      if (Math.random() > 0.5) {
        incomes.push({
          source: 'Dividendos',
          amount: 300.0 + Math.random() * 700,
          date: createDate(year, month, 20 + Math.floor(Math.random() * 5)),
          userId: user.id,
          tagId: tagByName.Investimentos?.id,
        });
      }

      // Despesas mensais
      // Aluguel (dia 1)
      expenses.push({
        item: 'Aluguel',
        amount: 1800.0,
        date: createDate(year, month, 1),
        isPaid: true,
        userId: user.id,
        tagId: tagByName.Moradia?.id,
      });

      // Supermercado (várias vezes no mês)
      const groceryCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < groceryCount; i++) {
        expenses.push({
          item: 'Supermercado',
          amount: 200.0 + Math.random() * 300,
          date: createDate(year, month, 5 + i * 8 + Math.floor(Math.random() * 5)),
          isPaid: Math.random() > 0.2,
          userId: user.id,
          tagId: tagByName.Alimentacao?.id,
        });
      }

      // Utilitários
      expenses.push({
        item: 'Energia',
        amount: 120.0 + Math.random() * 80,
        date: createDate(year, month, 10),
        isPaid: Math.random() > 0.3,
        userId: user.id,
        tagId: tagByName.Utilitario?.id,
      });

      expenses.push({
        item: 'Internet',
        amount: 120.0,
        date: createDate(year, month, 10),
        isPaid: Math.random() > 0.2,
        userId: user.id,
        tagId: tagByName.Utilitario?.id,
      });

      expenses.push({
        item: 'Agua',
        amount: 60.0 + Math.random() * 40,
        date: createDate(year, month, 12),
        isPaid: Math.random() > 0.3,
        userId: user.id,
        tagId: tagByName.Utilitario?.id,
      });

      // Transporte (várias vezes)
      const transportCount = 8 + Math.floor(Math.random() * 12);
      for (let i = 0; i < transportCount; i++) {
        expenses.push({
          item: Math.random() > 0.5 ? 'Uber' : 'Combustivel',
          amount: Math.random() > 0.5 ? 25.0 + Math.random() * 50 : 80.0 + Math.random() * 120,
          date: createDate(year, month, 1 + i * 3 + Math.floor(Math.random() * 2)),
          isPaid: true,
          userId: user.id,
          tagId: tagByName.Transporte?.id,
        });
      }

      // Lazer (algumas vezes)
      if (Math.random() > 0.4) {
        expenses.push({
          item: 'Cinema',
          amount: 50.0 + Math.random() * 100,
          date: createDate(year, month, 10 + Math.floor(Math.random() * 15)),
          isPaid: true,
          userId: user.id,
          tagId: tagByName.Lazer?.id,
        });
      }

      if (Math.random() > 0.5) {
        expenses.push({
          item: 'Restaurante',
          amount: 80.0 + Math.random() * 150,
          date: createDate(year, month, 15 + Math.floor(Math.random() * 10)),
          isPaid: true,
          userId: user.id,
          tagId: tagByName.Alimentacao?.id,
        });
      }

      // Vestuário (ocasionalmente)
      if (Math.random() > 0.7) {
        expenses.push({
          item: 'Roupas',
          amount: 150.0 + Math.random() * 300,
          date: createDate(year, month, 20 + Math.floor(Math.random() * 5)),
          isPaid: Math.random() > 0.3,
          userId: user.id,
          tagId: tagByName.Vestuario?.id,
        });
      }

      // Saúde (ocasionalmente)
      if (Math.random() > 0.6) {
        expenses.push({
          item: 'Farmacia',
          amount: 50.0 + Math.random() * 150,
          date: createDate(year, month, 5 + Math.floor(Math.random() * 20)),
          isPaid: true,
          userId: user.id,
          tagId: tagByName.Saude?.id,
        });
      }

      // Educação (ocasionalmente)
      if (Math.random() > 0.8) {
        expenses.push({
          item: 'Curso online',
          amount: 200.0 + Math.random() * 400,
          date: createDate(year, month, 1 + Math.floor(Math.random() * 5)),
          isPaid: Math.random() > 0.4,
          userId: user.id,
          tagId: tagByName.Educacao?.id,
        });
      }

      // Contas diversas
      if (Math.random() > 0.5) {
        expenses.push({
          item: 'Assinatura streaming',
          amount: 30.0 + Math.random() * 50,
          date: createDate(year, month, 1),
          isPaid: true,
          userId: user.id,
          tagId: tagByName.Lazer?.id,
        });
      }
    }

    // Criar todas as receitas e despesas
    await prisma.income.createMany({
      data: incomes,
    });

    await prisma.expense.createMany({
      data: expenses,
    });

    console.log(`Seed concluido com sucesso.`);
    console.log(`- ${incomes.length} receitas criadas`);
    console.log(`- ${expenses.length} despesas criadas`);

    console.log('Seed concluido com sucesso.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Erro ao executar seed:', error);
  process.exitCode = 1;
});
