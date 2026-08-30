// Demo-data seed script — NOT part of the app's runtime behavior. Populates
// the "Preview Org" account with a real crawl of elevenlabs.io plus a
// hand-authored "understanding" (grounded in what the crawl actually found,
// not invented — see the summary text below) standing in for the AI
// classification step, which needs a real ANTHROPIC_API_KEY this dev
// environment doesn't have. Run with:
//   node --env-file=.env node_modules/.bin/tsx scripts/seed-elevenlabs.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { crawlSite, normalizeUrl } from "../src/lib/sites/crawler";
import { classifyPageElements, deriveElementContent } from "../src/lib/sites/autoClassify";
import type { Prisma } from "../src/generated/prisma/client";

// Same manual .env read as tests/setup/env.ts and scripts/migrate-test-db.mjs
// — this runs via tsx, outside Next's automatic env loading.
if (!process.env.DATABASE_URL) {
  const envFile = readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const match = envFile.match(/^DATABASE_URL="(.*)"$/m);
  if (match) process.env.DATABASE_URL = match[1];
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SITE_URL = "https://elevenlabs.io";
const PREVIEW_ORG_SLUG = "preview-org";
const MAX_PAGES = 8;

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: PREVIEW_ORG_SLUG } });
  if (!org) {
    throw new Error(
      `No organization with slug "${PREVIEW_ORG_SLUG}" — sign up the preview account first.`,
    );
  }

  console.log(`Crawling ${SITE_URL} for real...`);
  const crawl = await crawlSite(SITE_URL);
  console.log(`Crawled ${crawl.pages.length} pages.`);

  const pages = crawl.pages
    .filter((p) => p.elements.length > 0)
    .slice(0, MAX_PAGES);

  const site = await prisma.$transaction(async (tx) => {
    await tx.site.deleteMany({ where: { organizationId: org.id, url: SITE_URL } });

    const site = await tx.site.create({
      data: { organizationId: org.id, url: SITE_URL, status: "READY" },
    });

    for (const page of pages) {
      const crawledPage = await tx.crawledPage.create({
        data: {
          siteId: site.id,
          organizationId: org.id,
          url: page.url,
          title: page.title,
        },
      });

      const classified = classifyPageElements(page.url, page.elements);
      await tx.contentElement.createMany({
        data: classified.map((c, order) => ({
          crawledPageId: crawledPage.id,
          organizationId: org.id,
          section: c.section,
          elementType: c.elementType,
          selector: c.raw.selector,
          currentContent: deriveElementContent(c.raw, c.elementType).slice(0, 2000),
          order,
        })),
      });
    }

    // Grounded in what the crawl actually returned (real headlines, real
    // named customers/partners, real product names) — summarized by hand,
    // not invented, standing in for the AI classification step.
    await tx.websiteUnderstanding.create({
      data: {
        siteId: site.id,
        organizationId: org.id,
        companySummary:
          "ElevenLabs builds AI voice and audio technology — text-to-speech, voice agents, dubbing, and music generation — used by enterprises, developers, and creators to add natural-sounding voice to their products.",
        productSummary:
          "Two platforms on the same research foundation: ElevenCreative (ultra-realistic speech, music, sound effects, and video) and ElevenAgents (conversational voice and chat agents that talk, type, and take action for customer support and other workflows).",
        targetCustomers:
          "Enterprises building customer-experience and contact-center workflows (Deutsche Telekom, Cisco, Revolut, TELUS Digital, KPN), plus developers and creators producing voice, video, and audio content.",
        brandTone: {
          tone: ["confident", "technical", "direct"],
          vocabulary: ["AI voice", "agents", "ultra-realistic", "enterprise-grade"],
          formality: "professional",
        } satisfies Prisma.InputJsonValue,
        valueProps: [
          "Ultra-realistic, emotionally aware speech synthesis",
          "Conversational voice agents that resolve customer issues end-to-end",
          "Enterprise-grade security and support at scale",
          "Dubbing and localization across 70+ languages",
        ] satisfies Prisma.InputJsonValue,
        primaryCta: "Book a personalized demo",
        // Hand-authored by a human reading the real crawl, not a live model
        // call — HEURISTIC is the honest label of the two the badge shows.
        method: "HEURISTIC",
      },
    });

    return site;
  });

  const elementCount = await prisma.contentElement.count({
    where: { organizationId: org.id, crawledPage: { site: { url: SITE_URL } } },
  });
  console.log(`Seeded ${pages.length} pages, ${elementCount} content elements.`);

  await seedReferencePersonalization(org.id, site.id);
}

// Real, saved, APPROVED personalization rules — not just crawl/understanding
// data — so Live View and the demo window always have something to
// demonstrate for device, buying intent, and industry alike. Re-derives
// target element ids from the just-(re)seeded page rather than hardcoding
// them, since every reseed generates fresh ids; each named audience is
// deleted-then-recreated so re-running this script stays idempotent instead
// of accumulating duplicates or drifting from the current element ids.
async function seedReferencePersonalization(organizationId: string, siteId: string) {
  const homepage = await prisma.contentElement.findMany({
    where: { organizationId, crawledPage: { siteId, url: normalizeUrl(SITE_URL) } },
  });

  async function seed(
    audienceName: string,
    rule: { field: string; value: string },
    element: (typeof homepage)[number] | undefined,
    variantContent: string,
  ) {
    if (!element) {
      console.warn(`Skipping "${audienceName}" — target element not found (site copy may have changed).`);
      return;
    }

    await prisma.audience.deleteMany({ where: { organizationId, name: audienceName } });
    const audience = await prisma.audience.create({
      data: {
        organizationId,
        name: audienceName,
        rules: {
          create: [{ organizationId, field: rule.field, operator: "EQUALS", value: rule.value, groupIndex: 0 }],
        },
      },
    });

    const variant = await prisma.elementVariant.create({
      data: { organizationId, contentElementId: element.id, content: variantContent },
    });
    await prisma.elementPersonalizationRule.create({
      data: {
        organizationId,
        contentElementId: element.id,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: 0,
        // Reference demo data — pre-approved, the same end state as if a
        // human had clicked Approve (docs/roadmap.md Phase 3 gate).
        status: "APPROVED",
      },
    });
    console.log(`Seeded audience "${audienceName}" -> "${variantContent.slice(0, 60)}..."`);
  }

  const heroHeadline = homepage.find((el) => el.section === "HERO" && el.elementType === "HEADLINE");
  const heroSubheadline = homepage.find((el) => el.section === "HERO" && el.elementType === "SUBHEADLINE");
  const platformFeature = homepage.find(
    (el) => el.currentContent === "Create, edit, and localize in one AI platform",
  );

  await seed(
    "Mobile visitors",
    { field: "device", value: "mobile" },
    heroHeadline,
    "Voice AI that fits in your pocket",
  );
  await seed(
    "High buying intent",
    { field: "attributes.buyingIntent", value: "High" },
    heroSubheadline,
    "Talk to our team today — get a tailored rollout plan and see ElevenLabs voice AI live in your product within days.",
  );
  await seed(
    "Technology / SaaS visitors",
    { field: "attributes.industry", value: "Technology / SaaS" },
    platformFeature,
    "Built for engineering teams — a real-time API, SDKs, and webhooks for every workflow.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
