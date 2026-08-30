-- AlterEnum
ALTER TYPE "SiteEventType" ADD VALUE 'CTA_CLICK';

-- AlterTable
ALTER TABLE "SiteEvent" ADD COLUMN     "contentElementId" TEXT,
ADD COLUMN     "personalized" BOOLEAN NOT NULL;

-- CreateIndex
CREATE INDEX "SiteEvent_siteId_type_personalized_idx" ON "SiteEvent"("siteId", "type", "personalized");

-- CreateIndex
CREATE INDEX "SiteEvent_contentElementId_idx" ON "SiteEvent"("contentElementId");

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_contentElementId_fkey" FOREIGN KEY ("contentElementId") REFERENCES "ContentElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

