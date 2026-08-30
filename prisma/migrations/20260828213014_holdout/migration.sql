-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "holdbackPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SiteEvent" ADD COLUMN     "heldOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SiteEvent_siteId_type_heldOut_idx" ON "SiteEvent"("siteId", "type", "heldOut");

