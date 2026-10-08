-- Migracao ADITIVA: mes de inicio dos aportes das metas (null = mes de criacao).
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "SavingsGoal" ADD COLUMN     "startMonth" TEXT;
