-- CreateEnum
CREATE TYPE "BanditExperimentStatus" AS ENUM ('RUNNING', 'STOPPED');

-- CreateTable
CREATE TABLE "BanditExperiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentElementId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "ruleAId" TEXT NOT NULL,
    "ruleBId" TEXT NOT NULL,
    "weightA" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" "BanditExperimentStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BanditExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BanditExperiment_organizationId_idx" ON "BanditExperiment"("organizationId");

-- CreateIndex
CREATE INDEX "BanditExperiment_contentElementId_idx" ON "BanditExperiment"("contentElementId");

-- CreateIndex
CREATE INDEX "BanditExperiment_audienceId_idx" ON "BanditExperiment"("audienceId");

-- AddForeignKey
ALTER TABLE "BanditExperiment" ADD CONSTRAINT "BanditExperiment_contentElementId_fkey" FOREIGN KEY ("contentElementId") REFERENCES "ContentElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanditExperiment" ADD CONSTRAINT "BanditExperiment_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
