import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runAutoOptimize } from "@/lib/autoOptimize/service";
import { runBanditWeightUpdates } from "@/lib/experiments/bandit";

// docs/launch-plan.md §5C ("Auto-draft"). The actual behavior lives in
// runAutoOptimize (src/lib/autoOptimize/service.ts) — this route only
// authorizes the request, per CLAUDE.md's route-handlers-stay-thin rule.
//
// Vercel Hobby caps cron at once/day (UTC-only, ±1h) — see vercel.json.
// That's a real, stated constraint, not an oversight: daily is a normal
// cadence for this kind of analysis, and a paid plan buys more frequency
// later without any code change here.
export const maxDuration = 60;

function requireCronSecret(request: Request): NextResponse | null {
  if (!env.CRON_SECRET) {
    // Never fall open — an unset secret means this route always refuses,
    // not that it runs unauthenticated. A real deployment that wants the
    // cron to actually do anything must set this.
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  // Bandit weight recompute rides along on this same daily trigger — see
  // src/lib/experiments/bandit.ts's runBanditWeightUpdates comment for why
  // it isn't a separate vercel.json cron entry. Independent of
  // runAutoOptimize: one failing does not block the other.
  const [autoOptimize, banditExperiments] = await Promise.all([runAutoOptimize(), runBanditWeightUpdates()]);
  return NextResponse.json({ autoOptimize, banditExperiments });
}
