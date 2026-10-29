-- CreateEnum
CREATE TYPE "CashEntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ClientFileCategory" AS ENUM ('LOGO', 'BRAND', 'PHOTO', 'DOCUMENT');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "brandColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "brandFonts" TEXT;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "category" "ClientFileCategory";

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" TEXT NOT NULL,
    "type" "CashEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT,
    "invoiceId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_invoiceId_key" ON "CashEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "CashEntry_date_idx" ON "CashEntry"("date");

-- CreateIndex
CREATE INDEX "CashEntry_type_date_idx" ON "CashEntry"("type", "date");

-- CreateIndex
CREATE INDEX "CashEntry_settled_idx" ON "CashEntry"("settled");

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores de lançamentos são sempre positivos; o tipo define entrada ou saída.
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_amount_positive" CHECK ("amountCents" > 0);

-- Arquivos já enviados direto ao cliente passam a ser "Documentos"; o logo atual vira "Logo".
UPDATE "FileAsset" SET "category" = 'DOCUMENT' WHERE "clientId" IS NOT NULL AND "taskId" IS NULL;
UPDATE "FileAsset" f SET "category" = 'LOGO' FROM "Client" c WHERE c."logoFileId" = f."id";
