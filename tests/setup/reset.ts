import { prisma } from "@/lib/db";

// Listed explicitly rather than relying on FK CASCADE from Organization —
// several tables (Visitor, Event, CampaignAssignment) use a plain scalar
// organizationId with no real foreign key (deliberate, see schema comments),
// so they'd silently survive a CASCADE truncate and leak state across tests.
const TABLES = [
  "RateLimitBucket",
  "IpEnrichmentCache",
  "Recommendation",
  "SiteEvent",
  "SiteVisitor",
  "Event",
  "Visitor",
  "CampaignAssignment",
  "Campaign",
  "AiProposal",
  "ElementPersonalizationRule",
  "ElementVariant",
  "ContentElement",
  "CrawledPage",
  "WebsiteUnderstanding",
  "Site",
  "Domain",
  "WebhookSubscription",
  "PersonalizationRule",
  "AudienceRule",
  "Audience",
  "ComponentVariant",
  "Component",
  "PageVersion",
  "Page",
  "Project",
  "PasswordResetToken",
  "Session",
  "Membership",
  "Organization",
  "User",
];

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
}
