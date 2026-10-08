-- Migracao ADITIVA: receitas fixas (regra + reajustes) e vinculo Income -> FixedIncome. Sem DROP, sem reescrita.
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "fixedIncomeCompetence" TEXT,
ADD COLUMN     "fixedIncomeId" TEXT;

-- CreateTable
CREATE TABLE "FixedIncome" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "tagId" TEXT,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "skippedCompetences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedIncomeAdjustment" (
    "id" TEXT NOT NULL,
    "fixedIncomeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedIncomeAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedIncome_userId_idx" ON "FixedIncome"("userId");

-- CreateIndex
CREATE INDEX "FixedIncome_userId_isActive_idx" ON "FixedIncome"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FixedIncomeAdjustment_fixedIncomeId_effectiveFrom_key" ON "FixedIncomeAdjustment"("fixedIncomeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Income_fixedIncomeId_idx" ON "Income"("fixedIncomeId");

-- CreateIndex
CREATE UNIQUE INDEX "Income_fixedIncomeId_fixedIncomeCompetence_key" ON "Income"("fixedIncomeId", "fixedIncomeCompetence");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_fixedIncomeId_fkey" FOREIGN KEY ("fixedIncomeId") REFERENCES "FixedIncome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedIncome" ADD CONSTRAINT "FixedIncome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedIncome" ADD CONSTRAINT "FixedIncome_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedIncomeAdjustment" ADD CONSTRAINT "FixedIncomeAdjustment_fixedIncomeId_fkey" FOREIGN KEY ("fixedIncomeId") REFERENCES "FixedIncome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

