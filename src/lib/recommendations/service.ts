import { prisma } from "@/lib/db";
import { HttpError, RateLimitedError } from "@/lib/auth/errors";
import { rateLimit } from "@/lib/auth/rateLimit";
import type { RuleOperator, RecommendationStatus } from "@/generated/prisma/client";
import type { VisitorContext } from "@dynamify/personalization-sdk";
import { analyzeSegments, type SegmentField } from "./analyze";
import { generateExperience, getGeneratedExperience, type GeneratedExperienceDTO } from "@/lib/sites/generateExperience";

// Same budget the old standalone generate-experience route used — a
// coordinated multi-element generation is a heavier call than a single
// suggestion. One per-organization cap shared across both the automatic
// (on-accept) and manual (retry) trigger below, not two separate budgets;
// checked here rather than at each route boundary since acceptRecommendation
// bundles this into a larger action that must still succeed even when the
// generation half of it is throttled.
async function assertExperienceGenerationAllowed(organizationId: string): Promise<void> {
  const limited = await rateLimit(`generate-experience:${organizationId}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.allowed) {
    throw new RateLimitedError("Too many experience generations recently. Try again later.", limited.retryAfterMs);
  }
}

export class RecommendationNotFoundError extends HttpError {
  constructor() {
    super(404, "Recommendation not found");
  }
}

export type RecommendationDTO = {
  id: string;
  siteId: string;
  siteUrl: string;
  crawledPageId: string;
  pageUrl: string;
  pageTitle: string | null;
  field: string;
  value: string;
  matchingEvents: number;
  totalEvents: number;
  share: number;
  status: RecommendationStatus;
  createdAt: string;
  // Populated only once this recommendation is ACCEPTED and a
  // GeneratedExperience exists for the resulting page+audience pairing —
  // re-derived at read time (see findExperienceFor), never cached, so
  // approving/disabling one piece through the normal per-element flow is
  // reflected here on the very next read.
  experience: GeneratedExperienceDTO | null;
};

type RecommendationRow = {
  id: string;
  siteId: string;
  crawledPageId: string;
  field: string;
  value: string;
  matchingEvents: number;
  totalEvents: number;
  status: RecommendationStatus;
  createdAt: Date;
  crawledPage: { url: string; title: string | null; site: { url: string } };
};

const RECOMMENDATION_INCLUDE = {
  crawledPage: { select: { url: true, title: true, site: { select: { url: true } } } },
} as const;

function toBaseDTO(rec: RecommendationRow): Omit<RecommendationDTO, "experience"> {
  return {
    id: rec.id,
    siteId: rec.siteId,
    siteUrl: rec.crawledPage.site.url,
    crawledPageId: rec.crawledPageId,
    pageUrl: rec.crawledPage.url,
    pageTitle: rec.crawledPage.title,
    field: rec.field,
    value: rec.value,
    matchingEvents: rec.matchingEvents,
    totalEvents: rec.totalEvents,
    share: rec.totalEvents === 0 ? 0 : rec.matchingEvents / rec.totalEvents,
    status: rec.status,
    createdAt: rec.createdAt.toISOString(),
  };
}

// How much recent traffic per page counts toward analysis — bounded so a
// high-traffic page's analysis stays cheap and reflects recent behavior,
// not the page's entire history.
const RECENT_EVENTS_LIMIT = 500;

function operatorFor(field: string): RuleOperator {
  return field === "referrer" ? "CONTAINS" : "EQUALS";
}

const FIELD_LABEL: Record<SegmentField, string> = {
  device: "Device",
  "geo.country": "Country",
  "utm.source": "UTM source",
  "utm.medium": "UTM medium",
  "utm.campaign": "UTM campaign",
  referrer: "Referrer",
};

function defaultAudienceName(field: string, value: string): string {
  return `${FIELD_LABEL[field as SegmentField] ?? field}: ${value}`;
}

// An audience "already targets" a segment only if one of its rules is
// exactly this single condition — not a superset (a multi-condition
// audience that happens to include this as one ANDed clause targets a
// narrower set of visitors, not this segment, so it doesn't count).
async function findMatchingAudience(organizationId: string, field: string, value: string) {
  const operator = operatorFor(field);
  const audiences = await prisma.audience.findMany({
    where: { organizationId, rules: { some: { field, operator, value: { equals: value } } } },
    include: { rules: true },
  });
  return audiences.find((a) => a.rules.length === 1) ?? null;
}

// Re-derives whichever GeneratedExperience already exists for this exact
// page+audience pairing — GeneratedExperience always carries both ids, so
// this needs no link stored on the Recommendation row itself.
async function findExperienceFor(
  organizationId: string,
  crawledPageId: string,
  audienceId: string,
): Promise<GeneratedExperienceDTO | null> {
  const experience = await prisma.generatedExperience.findFirst({
    where: { organizationId, crawledPageId, audienceId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return experience ? getGeneratedExperience(organizationId, experience.id) : null;
}

async function attachExperiences(organizationId: string, recs: RecommendationRow[]): Promise<RecommendationDTO[]> {
  return Promise.all(
    recs.map(async (rec) => {
      const base = toBaseDTO(rec);
      if (rec.status !== "ACCEPTED") return { ...base, experience: null };
      const audience = await findMatchingAudience(organizationId, rec.field, rec.value);
      const experience = audience ? await findExperienceFor(organizationId, rec.crawledPageId, audience.id) : null;
      return { ...base, experience };
    }),
  );
}

// Org-wide — every site's recommendations in one list (docs/roadmap.md:
// moved out of the per-site Sites panel into its own place under Tools).
// IGNORED recommendations are left out, same as before; ACCEPTED ones
// stay visible so their generated experience remains reviewable.
export async function listAllRecommendations(organizationId: string): Promise<RecommendationDTO[]> {
  const recs = await prisma.recommendation.findMany({
    where: { organizationId, status: { in: ["PENDING", "ACCEPTED"] } },
    include: RECOMMENDATION_INCLUDE,
    orderBy: { matchingEvents: "desc" },
  });
  return attachExperiences(organizationId, recs);
}

async function generateRecommendationsForSite(organizationId: string, siteId: string): Promise<void> {
  const pages = await prisma.crawledPage.findMany({
    where: { siteId, organizationId },
    select: { id: true },
  });

  for (const page of pages) {
    const events = await prisma.siteEvent.findMany({
      where: { crawledPageId: page.id, type: "PAGE_VIEW" },
      select: { context: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_EVENTS_LIMIT,
    });
    const contexts = events.map((event) => event.context as VisitorContext);
    const candidates = analyzeSegments(contexts);

    for (const candidate of candidates) {
      if (await findMatchingAudience(organizationId, candidate.field, candidate.value)) continue;

      await prisma.recommendation.upsert({
        where: {
          crawledPageId_field_value: {
            crawledPageId: page.id,
            field: candidate.field,
            value: candidate.value,
          },
        },
        create: {
          organizationId,
          siteId,
          crawledPageId: page.id,
          field: candidate.field,
          value: candidate.value,
          matchingEvents: candidate.matchingEvents,
          totalEvents: candidate.totalEvents,
        },
        update: {
          matchingEvents: candidate.matchingEvents,
          totalEvents: candidate.totalEvents,
        },
      });
    }
  }
}

// Runs analyze.ts's pure segment analysis across every connected site's
// recent traffic and upserts PENDING rows for qualifying segments — the
// org-wide "Check for recommendations" action.
export async function generateAllRecommendations(organizationId: string): Promise<RecommendationDTO[]> {
  const sites = await prisma.site.findMany({ where: { organizationId }, select: { id: true } });
  for (const site of sites) {
    await generateRecommendationsForSite(organizationId, site.id);
  }
  return listAllRecommendations(organizationId);
}

async function requireRecommendation(organizationId: string, recommendationId: string) {
  const rec = await prisma.recommendation.findFirst({ where: { id: recommendationId, organizationId } });
  if (!rec) throw new RecommendationNotFoundError();
  return rec;
}

// Turns a recommendation into real targeting and, in the same action,
// tries to generate a coordinated full-experience content bundle for it —
// "based on data [this recommendation's own traffic clustering] and
// audiences [the Audience this creates]" (docs/roadmap.md). A generation
// failure (rate limited, no eligible elements, nothing usable produced)
// never blocks accepting the recommendation — the audience is real either
// way; experienceError only explains why there's nothing to review yet.
// See generateExperienceForRecommendation for the retry path.
export async function acceptRecommendation(
  organizationId: string,
  recommendationId: string,
  audienceName?: string,
): Promise<{ audienceId: string; experience: GeneratedExperienceDTO | null; experienceError: string | null }> {
  const rec = await requireRecommendation(organizationId, recommendationId);

  const existing = await findMatchingAudience(organizationId, rec.field, rec.value);
  const audience =
    existing ??
    (await prisma.audience.create({
      data: {
        organizationId,
        name: audienceName?.trim() || defaultAudienceName(rec.field, rec.value),
        rules: {
          create: [{ organizationId, field: rec.field, operator: operatorFor(rec.field), value: rec.value, groupIndex: 0 }],
        },
      },
    }));

  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "ACCEPTED" } });

  let experience: GeneratedExperienceDTO | null = null;
  let experienceError: string | null = null;
  try {
    await assertExperienceGenerationAllowed(organizationId);
    experience = await generateExperience(organizationId, rec.crawledPageId, audience.id);
  } catch (error) {
    experienceError =
      error instanceof HttpError ? error.message : "Something went wrong generating content for this segment.";
  }

  return { audienceId: audience.id, experience, experienceError };
}

// The explicit recovery path (CLAUDE.md: every failure needs one) for
// when the automatic attempt inside acceptRecommendation didn't produce
// anything — a rate limit, or nothing usable at the time. Reuses the
// identical generation call, just triggered again on request.
export async function generateExperienceForRecommendation(
  organizationId: string,
  recommendationId: string,
): Promise<GeneratedExperienceDTO> {
  const rec = await requireRecommendation(organizationId, recommendationId);
  if (rec.status !== "ACCEPTED") {
    throw new HttpError(400, "Accept this recommendation before generating content for it.");
  }
  const audience = await findMatchingAudience(organizationId, rec.field, rec.value);
  if (!audience) throw new HttpError(404, "No matching audience found for this recommendation.");
  await assertExperienceGenerationAllowed(organizationId);
  return generateExperience(organizationId, rec.crawledPageId, audience.id);
}

export async function ignoreRecommendation(organizationId: string, recommendationId: string): Promise<void> {
  const rec = await requireRecommendation(organizationId, recommendationId);
  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "IGNORED" } });
}
