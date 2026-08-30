-- CreateEnum
CREATE TYPE "PersonSource" AS ENUM ('FORM', 'AUTH', 'CRM');

-- AlterTable: Organization retention config
ALTER TABLE "Organization" ADD COLUMN     "rawEventRetentionDays" INTEGER NOT NULL DEFAULT 395,
ADD COLUMN     "sessionRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "visitorRetentionDays" INTEGER NOT NULL DEFAULT 730;

-- CreateTable: Company (created before SiteVisitor.company is touched, so
-- the backfill below can read the old column before it's dropped)
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" TEXT,
    "name" TEXT,
    "sizeBand" TEXT,
    "industry" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ip_enrichment',
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" "PersonSource" NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "device" TEXT,
    "geoCountry" TEXT,
    "geoRegion" TEXT,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "ctaClickCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "crawledPageId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "elementVariantId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Impression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "siteEventId" TEXT NOT NULL,
    "goalId" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_organizationId_idx" ON "Company"("organizationId");
CREATE UNIQUE INDEX "Company_organizationId_domain_key" ON "Company"("organizationId", "domain");
CREATE INDEX "Person_organizationId_idx" ON "Person"("organizationId");
CREATE UNIQUE INDEX "Person_organizationId_email_key" ON "Person"("organizationId", "email");
CREATE INDEX "VisitorSession_organizationId_idx" ON "VisitorSession"("organizationId");
CREATE INDEX "VisitorSession_visitorId_lastEventAt_idx" ON "VisitorSession"("visitorId", "lastEventAt");
CREATE INDEX "Impression_organizationId_idx" ON "Impression"("organizationId");
CREATE INDEX "Impression_sessionId_idx" ON "Impression"("sessionId");
CREATE INDEX "Impression_crawledPageId_idx" ON "Impression"("crawledPageId");
CREATE UNIQUE INDEX "Conversion_siteEventId_key" ON "Conversion"("siteEventId");
CREATE INDEX "Conversion_organizationId_idx" ON "Conversion"("organizationId");
CREATE INDEX "Conversion_sessionId_idx" ON "Conversion"("sessionId");

-- AddForeignKey
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "SiteVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VisitorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Impression" ADD CONSTRAINT "Impression_crawledPageId_fkey" FOREIGN KEY ("crawledPageId") REFERENCES "CrawledPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VisitorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_siteEventId_fkey" FOREIGN KEY ("siteEventId") REFERENCES "SiteEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: backfill a real Company row per distinct
-- (organizationId, company-name) pair that exists today, name-keyed
-- since the only real provider configured (ipinfo.io basic tier) never
-- gives a domain — see the Company model's comment in schema.prisma.
INSERT INTO "Company" ("id", "organizationId", "name", "source", "resolvedAt")
SELECT gen_random_uuid()::text, t."organizationId", t."company", 'ip_enrichment', now()
FROM (SELECT DISTINCT "organizationId", "company" FROM "SiteVisitor" WHERE "company" IS NOT NULL) t;

-- AlterTable: add the new SiteVisitor columns, point companyId at the
-- just-backfilled rows, THEN drop the old bare-string column.
ALTER TABLE "SiteVisitor" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "consentState" JSONB NOT NULL DEFAULT '{"necessary":true,"analytics":false,"personalization":false}',
ADD COLUMN     "personId" TEXT;

UPDATE "SiteVisitor" sv
SET "companyId" = c."id"
FROM "Company" c
WHERE c."organizationId" = sv."organizationId"
  AND c."name" = sv."company"
  AND sv."company" IS NOT NULL;

ALTER TABLE "SiteVisitor" DROP COLUMN "company";

CREATE INDEX "SiteVisitor_companyId_idx" ON "SiteVisitor"("companyId");

ALTER TABLE "SiteVisitor" ADD CONSTRAINT "SiteVisitor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteVisitor" ADD CONSTRAINT "SiteVisitor_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: IpEnrichmentCache — table is empty in every environment
-- this has run in (a cache, safe to redefine outright rather than
-- attempting to hash rows that were never GDPR-compliant to keep in the
-- first place).
ALTER TABLE "IpEnrichmentCache" DROP CONSTRAINT "IpEnrichmentCache_pkey",
DROP COLUMN "ip",
ADD COLUMN     "ipHash" TEXT NOT NULL,
ADD CONSTRAINT "IpEnrichmentCache_pkey" PRIMARY KEY ("ipHash");

CREATE INDEX "IpEnrichmentCache_fetchedAt_idx" ON "IpEnrichmentCache"("fetchedAt");
