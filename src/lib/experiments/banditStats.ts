import { prisma } from "@/lib/db";

// Per-arm trial/success counts, derived entirely from existing data — no
// new write-path counters exist anywhere for this (docs/decisions.md D11).
// A tracked visitor's exposure to a rule already produces a real
// Impression row (src/lib/visitors/service.ts's recordImpressions,
// keyed by ruleId); a real conversion is a real Conversion row linked to
// the same visitor's session history. This just reads both.
export type ArmStats = { trials: number; successes: number };

// Distinct tracked visitors ever shown this arm's rule as the resolve()
// winner — a visitor counts once regardless of how many times they were
// shown it, since a LEAD/SALE is a one-time-per-visitor outcome to
// measure, not a per-impression one (repeat page views by the same
// visitor would otherwise inflate the trial count relative to the real
// question: "did exposing this visitor to arm A lead to a conversion").
export async function computeArmStats(organizationId: string, ruleId: string): Promise<ArmStats> {
  const exposed = await prisma.visitorSession.findMany({
    where: { organizationId, impressions: { some: { ruleId } } },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });
  if (exposed.length === 0) return { trials: 0, successes: 0 };

  // Cross-session, deliberately: a real buying journey (a demo request
  // today, a sale next week) shouldn't be missed just because it spans
  // more than one session — matching a visitor's real lifetime, not one
  // visit. LEAD and SALE are both real conversion-goal events
  // (docs/roadmap.md — Lead/Sale Event Tracking); either counts as a
  // success for allocation purposes.
  const converted = await prisma.visitorSession.findMany({
    where: {
      organizationId,
      visitorId: { in: exposed.map((v) => v.visitorId) },
      conversions: { some: { siteEvent: { type: { in: ["LEAD", "SALE"] } } } },
    },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });
  return { trials: exposed.length, successes: converted.length };
}

// --- Thompson Sampling ------------------------------------------------
//
// Uses Math.random() — deliberately, and only here. CLAUDE.md's "no
// Math.random()" rule is scoped to the visitor-facing personalization
// engine's own determinism requirement (same visitor, same input, same
// output). This runs once a day, server-side, off the request path
// entirely (see runBanditWeightUpdates) — its *output* (a stored weightA)
// is what the deterministic selectBanditArm (bandit.ts) consumes
// afterward. Nothing a visitor does ever depends on this function running
// twice producing the same number.

// Below this many trials on *either* arm, a Thompson-Sampling estimate is
// dominated by noise, not signal — same MIN_GROUP_SIZE reasoning
// significance.ts already uses for the causal-lift z-test. Refuse to act:
// serve the default 50/50 split and say so (docs/autonomy.md's own
// explicit recommendation), rather than confidently reallocating traffic
// on a handful of data points.
export const MIN_BANDIT_SAMPLE = 30;
// Never fully starve the "losing" arm — keep collecting real data on it
// too (it may recover, and a human still has to act to end the
// experiment; this isn't a system that quietly finalizes a winner on its
// own), and never treat a leading arm as a certainty.
const MIN_ARM_WEIGHT = 0.1;
const MAX_ARM_WEIGHT = 0.9;
const THOMPSON_SAMPLES = 5000;

// Marsaglia-Tsang method, standard and simple — no dependency needed for
// one distribution. Valid for shape >= 1, which alpha/beta always are
// here (successes+1 and trials-successes+1 are both >= 1 by construction).
function sampleGamma(shape: number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = gaussian();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Box-Muller — a standard normal sample, the one building block
// sampleGamma needs.
function gaussian(): number {
  const u1 = Math.random() || Number.EPSILON; // never exactly 0, log(0) is -Infinity
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Exported for direct distributional testing (mean/variance sanity
// checks) — computeWeightA's own tests only exercise it indirectly.
export function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// Monte Carlo estimate of P(arm A's true conversion rate > arm B's),
// using each arm's Beta(successes+1, trials-successes+1) posterior
// (uninformative Beta(1,1) prior). That probability *is* the fraction of
// traffic Thompson Sampling would send to A. Clamped to
// [MIN_ARM_WEIGHT, MAX_ARM_WEIGHT] and gated at MIN_BANDIT_SAMPLE — see
// their own comments above.
export function computeWeightA(a: ArmStats, b: ArmStats): number {
  if (a.trials < MIN_BANDIT_SAMPLE || b.trials < MIN_BANDIT_SAMPLE) return 0.5;

  let aWins = 0;
  for (let i = 0; i < THOMPSON_SAMPLES; i++) {
    const sampleA = sampleBeta(a.successes + 1, a.trials - a.successes + 1);
    const sampleB = sampleBeta(b.successes + 1, b.trials - b.successes + 1);
    if (sampleA > sampleB) aWins++;
  }

  const raw = aWins / THOMPSON_SAMPLES;
  return Math.min(MAX_ARM_WEIGHT, Math.max(MIN_ARM_WEIGHT, raw));
}
