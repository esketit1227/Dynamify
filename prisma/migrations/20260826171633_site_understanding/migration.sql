-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('PENDING', 'CRAWLING', 'UNDERSTANDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentSection" AS ENUM ('HERO', 'FEATURES', 'TESTIMONIALS', 'CTA', 'NAV', 'FOOTER', 'PRICING', 'FAQ', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentElementType" AS ENUM ('HEADLINE', 'SUBHEADLINE', 'BODY', 'IMAGE', 'CTA_LABEL', 'CTA_HREF', 'LOGO', 'NAV_LABEL', 'OTHER');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawledPage" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawledPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentElement" (
    "id" TEXT NOT NULL,
    "crawledPageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "section" "ContentSection" NOT NULL,
    "elementType" "ContentElementType" NOT NULL,
    "selector" TEXT NOT NULL,
    "currentContent" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteUnderstanding" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companySummary" TEXT NOT NULL,
    "productSummary" TEXT NOT NULL,
    "targetCustomers" TEXT NOT NULL,
    "brandTone" JSONB NOT NULL,
    "valueProps" JSONB NOT NULL,
    "primaryCta" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteUnderstanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Site_organizationId_idx" ON "Site"("organizationId");

-- CreateIndex
CREATE INDEX "CrawledPage_organizationId_idx" ON "CrawledPage"("organizationId");

-- CreateIndex
CREATE INDEX "CrawledPage_siteId_idx" ON "CrawledPage"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "CrawledPage_siteId_url_key" ON "CrawledPage"("siteId", "url");

-- CreateIndex
CREATE INDEX "ContentElement_organizationId_idx" ON "ContentElement"("organizationId");

-- CreateIndex
CREATE INDEX "ContentElement_crawledPageId_idx" ON "ContentElement"("crawledPageId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteUnderstanding_siteId_key" ON "WebsiteUnderstanding"("siteId");

-- CreateIndex
CREATE INDEX "WebsiteUnderstanding_organizationId_idx" ON "WebsiteUnderstanding"("organizationId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawledPage" ADD CONSTRAINT "CrawledPage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentElement" ADD CONSTRAINT "ContentElement_crawledPageId_fkey" FOREIGN KEY ("crawledPageId") REFERENCES "CrawledPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteUnderstanding" ADD CONSTRAINT "WebsiteUnderstanding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

