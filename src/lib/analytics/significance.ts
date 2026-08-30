// A standard two-proportion z-test — pure, no dependency, fully
// unit-testable. This exists because "personalized converts at 28% vs.
// generic at 11%" is not, on its own, evidence that personalization
// *caused* the difference: those are two different populations (see
// src/lib/experiments/holdout.ts's own comment). Once a site runs a real
// holdout — the same population, split by a coin flip, some shown
// personalized content and some deliberately shown the default — this is
// the test that turns "our number looks better" into "we can say with
// 95% confidence this isn't noise."

export const MIN_GROUP_SIZE = 30;
const SIGNIFICANCE_LEVEL = 0.05;

export type ProportionSample = { conversions: number; total: number };

export type SignificanceResult = {
  zScore: number;
  pValue: number;
  significant: boolean;
  // Positive means `treatment` converts higher than `control`.
  direction: "higher" | "lower" | "no_difference";
};

// Abramowitz & Stegun 7.1.26 — accurate to ~1.5e-7, more than enough
// precision for a conversion-rate significance check.
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return sign * y;
}

function standardNormalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// null (not a "not significant" result) whenever either group is too
// small for the normal approximation underlying a z-test to be
// trustworthy — a confident-looking p-value from 4 samples would be
// worse than no verdict at all.
export function twoProportionZTest(control: ProportionSample, treatment: ProportionSample): SignificanceResult | null {
  if (control.total < MIN_GROUP_SIZE || treatment.total < MIN_GROUP_SIZE) return null;

  const p1 = control.conversions / control.total;
  const p2 = treatment.conversions / treatment.total;
  const pooled = (control.conversions + treatment.conversions) / (control.total + treatment.total);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / control.total + 1 / treatment.total));

  // No variance at all (e.g. 0 conversions in both groups) — nothing to
  // test, and dividing by zero would produce a meaningless z-score.
  if (standardError === 0) {
    return { zScore: 0, pValue: 1, significant: false, direction: "no_difference" };
  }

  const zScore = (p2 - p1) / standardError;
  const pValue = 2 * (1 - standardNormalCdf(Math.abs(zScore)));
  const significant = pValue < SIGNIFICANCE_LEVEL;

  return {
    zScore,
    pValue,
    significant,
    direction: !significant ? "no_difference" : p2 > p1 ? "higher" : "lower",
  };
}
