-- Migracao ADITIVA: coluna com default constante (sem reescrever a tabela).
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN "skippedCompetences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
