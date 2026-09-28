-- Migracao ADITIVA: sem DROP, sem reescrita de dados.
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "fixedExpenseCompetence" TEXT;

-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN "endDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_fixedExpenseId_fixedExpenseCompetence_key" ON "Expense"("fixedExpenseId", "fixedExpenseCompetence");
