-- Migracao ADITIVA: teste gratis passa a ser escolha do usuario (uma vez por conta).
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "trialStartedAt" TIMESTAMP(3);

-- Todos os usuarios existentes ja receberam o teste no lancamento: nao podem iniciar outro.
UPDATE "User" SET "trialStartedAt" = NOW() WHERE "trialStartedAt" IS NULL;
