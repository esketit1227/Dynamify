import { prisma } from "@/lib/db";
import { generateAllRecommendations, acceptRecommendation } from "@/lib/recommendations/service";

export type AutoOptimizeOrgResult = {
  organizationId: string;
  drafted: number;
  rateLimited: boolean;
};

export type AutoOptimizeResult = {
  ranForOrgs: number;
  results: AutoOptimizeOrgResult[];
};

// docs/launch-plan.md §5C ("Auto-draft") — for every org that opted in
// (Organization.autoOptimizeEnabled), find new real segment opportunities
// and draft AI copy for them: the same as a human clicking "Check for
// recommendations" and then accepting each one. Every resulting rule still
// lands PENDING — approval is completely untouched by this.
//
// Called by the daily cron route (src/app/api/cron/auto-optimize/route.ts),
// which owns only the auth check — this is where the actual behavior lives,
// per CLAUDE.md's route-handlers-stay-thin rule, and so it's unit-testable
// without faking a Request.
export async function runAutoOptimize(): Promise<AutoOptimizeResult> {
  const orgs = await prisma.organization.findMany({
    where: { autoOptimizeEnabled: true },
    select: { id: true },
  });

  const results: AutoOptimizeOrgResult[] = [];

  for (const org of orgs) {
    let drafted = 0;
    let rateLimited = false;
    try {
      const recs = await generateAllRecommendations(org.id);
      const pending = recs.filter((r) => r.status === "PENDING");

      for (const rec of pending) {
        const { experience, experienceError } = await acceptRecommendation(org.id, rec.id);
        if (experience) drafted++;
        // acceptRecommendation marks a recommendation ACCEPTED unconditionally,
        // *before* it even checks the rate limit — generation is always
        // best-effort, by original design (see its own "accept never fails
        // because of it" test). So the recommendation that actually trips
        // the limit is already ACCEPTED-with-no-draft by the time we see
        // this; breaking here only spares the *remaining* pending recs in
        // this batch from a guaranteed-rate-limited attempt each — they
        // stay genuinely untouched (still PENDING) and get picked up by a
        // future run (generateAllRecommendations is an upsert, not a
        // duplicate).
        if (experienceError?.startsWith("Too many")) {
          rateLimited = true;
          break;
        }
      }
    } catch (error) {
      // One org's real failure (a bad crawl state, a DB error) must never
      // stop the rest — same posture as runCrawlAndUnderstand's per-site
      // isolation. Logged, not swallowed silently (src/lib/sites/service.ts
      // set this precedent directly).
      console.error(`auto-optimize failed for org ${org.id}:`, error);
    }
    results.push({ organizationId: org.id, drafted, rateLimited });
  }

  return { ranForOrgs: orgs.length, results };
}
