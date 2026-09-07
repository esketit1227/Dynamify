-- CreateEnum
CREATE TYPE "PageDesignStatus" AS ENUM ('PENDING', 'ENDORSED');

-- CreateTable
CREATE TABLE "PageDesign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "crawledPageId" TEXT NOT NULL,
    "status" "PageDesignStatus" NOT NULL DEFAULT 'PENDING',
    "method" "VariantMethod" NOT NULL DEFAULT 'HEURISTIC',
    "marketContext" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageDesign_organizationId_idx" ON "PageDesign"("organizationId");

-- CreateIndex
CREATE INDEX "PageDesign_crawledPageId_idx" ON "PageDesign"("crawledPageId");

-- AddForeignKey
ALTER TABLE "PageDesign" ADD CONSTRAINT "PageDesign_crawledPageId_fkey" FOREIGN KEY ("crawledPageId") REFERENCES "CrawledPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
