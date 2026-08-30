-- CreateEnum
CREATE TYPE "PersonalizationBoundary" AS ENUM ('ALLOWED', 'RESTRICTED', 'NEVER');

-- AlterTable
ALTER TABLE "ContentElement" ADD COLUMN     "personalizationBoundary" "PersonalizationBoundary";

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "autoApproveAiContent" BOOLEAN NOT NULL DEFAULT false;
