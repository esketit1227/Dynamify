-- CreateEnum
CREATE TYPE "UnderstandingMethod" AS ENUM ('AI', 'HEURISTIC');

-- AlterTable
ALTER TABLE "WebsiteUnderstanding" ADD COLUMN     "method" "UnderstandingMethod" NOT NULL DEFAULT 'AI';

