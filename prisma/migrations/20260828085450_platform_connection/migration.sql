-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'SQUARESPACE');

-- CreateEnum
CREATE TYPE "PlatformConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "externalStoreId" TEXT NOT NULL,
    "status" "PlatformConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "encryptedCredentials" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformConnection_organizationId_idx" ON "PlatformConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_platform_externalStoreId_key" ON "PlatformConnection"("platform", "externalStoreId");

-- AddForeignKey
ALTER TABLE "PlatformConnection" ADD CONSTRAINT "PlatformConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

