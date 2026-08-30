-- CreateEnum
CREATE TYPE "SiteEventType" AS ENUM ('PAGE_VIEW');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IGNORED');

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "crawledPageId" TEXT NOT NULL,
    "type" "SiteEventType" NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "crawledPageId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "matchingEvents" INTEGER NOT NULL,
    "totalEvents" INTEGER NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteEvent_organizationId_idx" ON "SiteEvent"("organizationId");

-- CreateIndex
CREATE INDEX "SiteEvent_siteId_idx" ON "SiteEvent"("siteId");

-- CreateIndex
CREATE INDEX "SiteEvent_siteId_type_idx" ON "SiteEvent"("siteId", "type");

-- CreateIndex
CREATE INDEX "SiteEvent_crawledPageId_idx" ON "SiteEvent"("crawledPageId");

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_idx" ON "Recommendation"("organizationId");

-- CreateIndex
CREATE INDEX "Recommendation_siteId_idx" ON "Recommendation"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_crawledPageId_field_value_key" ON "Recommendation"("crawledPageId", "field", "value");

