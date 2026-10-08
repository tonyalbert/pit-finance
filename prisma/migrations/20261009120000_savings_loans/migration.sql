-- Migracao ADITIVA: emprestimos da propria meta (parcelas viram despesas). Sem DROP, sem reescrita.
SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "SavingsLoan" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "monthlyRate" DECIMAL(5,2) NOT NULL,
    "installments" INTEGER NOT NULL,
    "installmentAmount" DECIMAL(12,2) NOT NULL,
    "firstDueDate" TIMESTAMP(3) NOT NULL,
    "installmentGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavingsLoan_installmentGroupId_key" ON "SavingsLoan"("installmentGroupId");

-- CreateIndex
CREATE INDEX "SavingsLoan_goalId_idx" ON "SavingsLoan"("goalId");

-- CreateIndex
CREATE INDEX "SavingsLoan_userId_idx" ON "SavingsLoan"("userId");

-- AddForeignKey
ALTER TABLE "SavingsLoan" ADD CONSTRAINT "SavingsLoan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsLoan" ADD CONSTRAINT "SavingsLoan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

