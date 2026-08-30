-- CreateEnum
CREATE TYPE "PersonalizationRuleStatus" AS ENUM ('PENDING', 'APPROVED');

-- AlterTable
ALTER TABLE "ElementPersonalizationRule" ADD COLUMN     "status" "PersonalizationRuleStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: rows created before this gate existed were already live under
-- the old (ungated) behavior — treat them as pre-approved so existing
-- personalizations (including the seeded demo reference rule) don't
-- silently stop resolving. Only rows created going forward default to
-- PENDING and require an explicit approval.
UPDATE "ElementPersonalizationRule" SET "status" = 'APPROVED';
