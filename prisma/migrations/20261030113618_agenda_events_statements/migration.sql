-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "statementMonth" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AgendaEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "clientId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaEventAttendee" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AgendaEventAttendee_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "AgendaEvent_startsAt_idx" ON "AgendaEvent"("startsAt");

-- CreateIndex
CREATE INDEX "AgendaEvent_clientId_idx" ON "AgendaEvent"("clientId");

-- CreateIndex
CREATE INDEX "AgendaEventAttendee_userId_idx" ON "AgendaEventAttendee"("userId");

-- CreateIndex
CREATE INDEX "FileAsset_statementMonth_idx" ON "FileAsset"("statementMonth");

-- AddForeignKey
ALTER TABLE "AgendaEvent" ADD CONSTRAINT "AgendaEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEvent" ADD CONSTRAINT "AgendaEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEventAttendee" ADD CONSTRAINT "AgendaEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AgendaEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEventAttendee" ADD CONSTRAINT "AgendaEventAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Evento termina depois de começar; arquivo de extrato não pertence a tarefa nem a cliente.
ALTER TABLE "AgendaEvent" ADD CONSTRAINT "AgendaEvent_ends_after_start" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_statement_owner" CHECK ("statementMonth" IS NULL OR ("taskId" IS NULL AND "clientId" IS NULL));
