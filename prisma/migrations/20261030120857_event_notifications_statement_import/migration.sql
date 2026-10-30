-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_INVITE';

-- AlterTable
ALTER TABLE "CashEntry" ADD COLUMN     "importKey" TEXT,
ADD COLUMN     "statementFileId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_importKey_key" ON "CashEntry"("importKey");

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_statementFileId_fkey" FOREIGN KEY ("statementFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AgendaEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

