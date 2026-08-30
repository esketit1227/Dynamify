-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "visitorTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SiteEvent" ADD COLUMN     "visitorId" TEXT;

-- CreateTable
CREATE TABLE "SiteVisitor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "ctaClickCount" INTEGER NOT NULL DEFAULT 0,
    "visitedPageIds" JSONB NOT NULL DEFAULT '[]',
    "distinctPages" INTEGER NOT NULL DEFAULT 0,
    "company" TEXT,
    "lastDevice" TEXT,
    "interest" TEXT,
    "intentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'awareness',

    CONSTRAINT "SiteVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteVisitor_organizationId_idx" ON "SiteVisitor"("organizationId");

-- CreateIndex
CREATE INDEX "SiteVisitor_siteId_idx" ON "SiteVisitor"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisitor_siteId_visitorKey_key" ON "SiteVisitor"("siteId", "visitorKey");

-- CreateIndex
CREATE INDEX "SiteEvent_visitorId_idx" ON "SiteEvent"("visitorId");

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "SiteVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

