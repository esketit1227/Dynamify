/*
  Warnings:

  - The `eventTypes` column on the `WebhookSubscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "WebhookSubscription" DROP COLUMN "eventTypes",
ADD COLUMN     "eventTypes" "SiteEventType"[];
