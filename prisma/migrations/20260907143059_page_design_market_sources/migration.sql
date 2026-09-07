/*
  Warnings:

  - Added the required column `marketSources` to the `PageDesign` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PageDesign" ADD COLUMN     "marketSources" JSONB NOT NULL;
