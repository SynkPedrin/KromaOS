-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'PERMISSION_DENIED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MetaInsightLevel" AS ENUM ('ACCOUNT', 'CAMPAIGN', 'ADSET', 'AD');

-- CreateEnum
CREATE TYPE "MetaSyncKind" AS ENUM ('INITIAL', 'RECENT', 'RECONCILE', 'MANUAL');

-- CreateEnum
CREATE TYPE "MetaSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "encryptedAccessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "dataAccessExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metaUserId" TEXT NOT NULL,
    "metaUserName" TEXT,
    "connectedById" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "accountStatus" INTEGER,
    "disableReason" INTEGER,
    "businessName" TEXT,
    "connectionId" TEXT,
    "clientId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncOk" BOOLEAN,
    "lastSyncError" TEXT,
    "syncLockedUntil" TIMESTAMP(3),
    "historyFrom" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "buyingType" TEXT,
    "dailyBudgetCents" INTEGER,
    "lifetimeBudgetCents" INTEGER,
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "createdTime" TIMESTAMP(3),
    "updatedTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdSet" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "dailyBudgetCents" INTEGER,
    "lifetimeBudgetCents" INTEGER,
    "optimizationGoal" TEXT,
    "billingEvent" TEXT,
    "bidStrategy" TEXT,
    "destinationType" TEXT,
    "promotedObject" JSONB,
    "targeting" JSONB,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCreative" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT,
    "objectType" TEXT,
    "format" TEXT NOT NULL DEFAULT 'OTHER',
    "thumbnailUrl" TEXT,
    "imageUrl" TEXT,
    "videoId" TEXT,
    "primaryText" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "callToAction" TEXT,
    "linkUrl" TEXT,
    "instagramPermalinkUrl" TEXT,
    "carousel" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAd" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "creativeId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "previewUrl" TEXT,
    "createdTime" TIMESTAMP(3),
    "updatedTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInsight" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "level" "MetaInsightLevel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "date" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER,
    "actions" JSONB NOT NULL DEFAULT '{}',
    "actionValues" JSONB NOT NULL DEFAULT '{}',
    "attribution" TEXT NOT NULL DEFAULT 'unified',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInsightPeriod" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "level" "MetaInsightLevel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "since" DATE NOT NULL,
    "until" DATE NOT NULL,
    "reach" INTEGER,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaInsightPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaSyncJob" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT,
    "kind" "MetaSyncKind" NOT NULL,
    "status" "MetaSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredById" TEXT,
    "since" DATE,
    "until" DATE,
    "records" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MetaSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_metaUserId_key" ON "MetaConnection"("metaUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_externalId_key" ON "MetaAdAccount"("externalId");

-- CreateIndex
CREATE INDEX "MetaAdAccount_clientId_idx" ON "MetaAdAccount"("clientId");

-- CreateIndex
CREATE INDEX "MetaAdAccount_connectionId_idx" ON "MetaAdAccount"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaign_externalId_key" ON "MetaCampaign"("externalId");

-- CreateIndex
CREATE INDEX "MetaCampaign_adAccountId_idx" ON "MetaCampaign"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSet_externalId_key" ON "MetaAdSet"("externalId");

-- CreateIndex
CREATE INDEX "MetaAdSet_adAccountId_idx" ON "MetaAdSet"("adAccountId");

-- CreateIndex
CREATE INDEX "MetaAdSet_campaignId_idx" ON "MetaAdSet"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCreative_externalId_key" ON "MetaCreative"("externalId");

-- CreateIndex
CREATE INDEX "MetaCreative_adAccountId_idx" ON "MetaCreative"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAd_externalId_key" ON "MetaAd"("externalId");

-- CreateIndex
CREATE INDEX "MetaAd_adAccountId_idx" ON "MetaAd"("adAccountId");

-- CreateIndex
CREATE INDEX "MetaAd_adSetId_idx" ON "MetaAd"("adSetId");

-- CreateIndex
CREATE INDEX "MetaAd_campaignId_idx" ON "MetaAd"("campaignId");

-- CreateIndex
CREATE INDEX "MetaInsight_adAccountId_level_date_idx" ON "MetaInsight"("adAccountId", "level", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInsight_adAccountId_level_externalId_date_key" ON "MetaInsight"("adAccountId", "level", "externalId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInsightPeriod_adAccountId_level_externalId_since_until_key" ON "MetaInsightPeriod"("adAccountId", "level", "externalId", "since", "until");

-- CreateIndex
CREATE INDEX "MetaSyncJob_adAccountId_startedAt_idx" ON "MetaSyncJob"("adAccountId", "startedAt");

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCreative" ADD CONSTRAINT "MetaCreative_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "MetaAdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "MetaCreative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsight" ADD CONSTRAINT "MetaInsight_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInsightPeriod" ADD CONSTRAINT "MetaInsightPeriod_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaSyncJob" ADD CONSTRAINT "MetaSyncJob_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

