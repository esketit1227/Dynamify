-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_crawledPageId_fkey" FOREIGN KEY ("crawledPageId") REFERENCES "CrawledPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_crawledPageId_fkey" FOREIGN KEY ("crawledPageId") REFERENCES "CrawledPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

