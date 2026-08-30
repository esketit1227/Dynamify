-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "ipEnrichmentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IpEnrichmentCache" (
    "ip" TEXT NOT NULL,
    "company" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpEnrichmentCache_pkey" PRIMARY KEY ("ip")
);

