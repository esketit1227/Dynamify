-- CreateEnum
CREATE TYPE "GeneratedExperienceStatus" AS ENUM ('PENDING', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ElementPersonalizationRule" ADD COLUMN     "generatedExperienceId" TEXT;

-- CreateTable
CREATE TABLE "GeneratedExperience" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "crawledPageId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "status" "GeneratedExperienceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedExperience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedExperience_organizationId_idx" ON "GeneratedExperience"("organizationId");

-- CreateIndex
CREATE INDEX "GeneratedExperience_crawledPageId_idx" ON "GeneratedExperience"("crawledPageId");

-- CreateIndex
CREATE INDEX "GeneratedExperience_audienceId_idx" ON "GeneratedExperience"("audienceId");

-- CreateIndex
CREATE INDEX "ElementPersonalizationRule_generatedExperienceId_idx" ON "ElementPersonalizationRule"("generatedExperienceId");

-- AddForeignKey
ALTER TABLE "ElementPersonalizationRule" ADD CONSTRAINT "ElementPersonalizationRule_generatedExperienceId_fkey" FOREIGN KEY ("generatedExperienceId") REFERENCES "GeneratedExperience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedExperience" ADD CONSTRAINT "GeneratedExperience_crawledPageId_fkey" FOREIGN KEY ("crawledPageId") REFERENCES "CrawledPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedExperience" ADD CONSTRAINT "GeneratedExperience_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

