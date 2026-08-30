-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PAGE_VIEW', 'PERSONALIZATION_IMPRESSION', 'CTA_CLICK', 'FORM_START', 'FORM_SUBMIT', 'CONVERSION');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CampaignVariantAssignment" AS ENUM ('DEFAULT', 'VARIANT');

-- CreateEnum
CREATE TYPE "AiProposalKind" AS ENUM ('AUDIENCE', 'COPY', 'VARIANT');

-- CreateEnum
CREATE TYPE "AiProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "publishedVersionId" TEXT;

-- AlterTable
ALTER TABLE "PageVersion" ADD COLUMN     "compiledContent" JSONB;

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageVersionId" TEXT,
    "visitorId" TEXT NOT NULL,
    "campaignId" TEXT,
    "type" "EventType" NOT NULL,
    "componentId" TEXT,
    "componentVariantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "audienceId" TEXT,
    "trafficSource" TEXT,
    "goalEventType" "EventType" NOT NULL,
    "splitPercent" INTEGER NOT NULL DEFAULT 50,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "variant" "CampaignVariantAssignment" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AiProposalKind" NOT NULL,
    "input" JSONB NOT NULL,
    "proposedContent" JSONB NOT NULL,
    "status" "AiProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventTypes" "EventType"[],
    "signingSecret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_organizationId_idx" ON "Visitor"("organizationId");

-- CreateIndex
CREATE INDEX "Event_organizationId_idx" ON "Event"("organizationId");

-- CreateIndex
CREATE INDEX "Event_pageId_idx" ON "Event"("pageId");

-- CreateIndex
CREATE INDEX "Event_pageId_type_idx" ON "Event"("pageId", "type");

-- CreateIndex
CREATE INDEX "Event_visitorId_idx" ON "Event"("visitorId");

-- CreateIndex
CREATE INDEX "Event_campaignId_idx" ON "Event"("campaignId");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_pageId_idx" ON "Campaign"("pageId");

-- CreateIndex
CREATE INDEX "Campaign_audienceId_idx" ON "Campaign"("audienceId");

-- CreateIndex
CREATE INDEX "CampaignAssignment_organizationId_idx" ON "CampaignAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "CampaignAssignment_visitorId_idx" ON "CampaignAssignment"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAssignment_campaignId_visitorId_key" ON "CampaignAssignment"("campaignId", "visitorId");

-- CreateIndex
CREATE INDEX "AiProposal_organizationId_idx" ON "AiProposal"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE INDEX "Domain_organizationId_idx" ON "Domain"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_organizationId_idx" ON "WebhookSubscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_publishedVersionId_key" ON "Page"("publishedVersionId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "PageVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssignment" ADD CONSTRAINT "CampaignAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

