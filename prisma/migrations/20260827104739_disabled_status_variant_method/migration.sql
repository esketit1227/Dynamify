-- CreateEnum
CREATE TYPE "VariantMethod" AS ENUM ('MANUAL', 'AI', 'HEURISTIC');

-- AlterEnum
ALTER TYPE "PersonalizationRuleStatus" ADD VALUE 'DISABLED';

-- AlterTable
ALTER TABLE "ElementVariant" ADD COLUMN     "method" "VariantMethod" NOT NULL DEFAULT 'MANUAL';
