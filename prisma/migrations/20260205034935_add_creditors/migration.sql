-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "creditorId" TEXT;

-- CreateTable
CREATE TABLE "Creditor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creditor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Creditor_userId_idx" ON "Creditor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Creditor_userId_name_key" ON "Creditor"("userId", "name");

-- CreateIndex
CREATE INDEX "Expense_userId_creditorId_idx" ON "Expense"("userId", "creditorId");

-- AddForeignKey
ALTER TABLE "Creditor" ADD CONSTRAINT "Creditor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "Creditor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
