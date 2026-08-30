// A small, named heuristic — not a certainty, not machine learning. Feeds
// the "Visitors" page's intent/stage columns, which are always labeled as
// inferred, not measured (see docs/roadmap.md's Hardening note for the
// full "what's real vs. what's heuristic" breakdown). Pure, no I/O, so
// it's directly unit-testable and never silently drifts based on when a
// row happens to be read, unlike D7's "computed once at record time" for
// `SiteEvent.personalized` — this one legitimately recomputes on every
// event, since a visitor's own accumulating behavior is exactly what it's
// meant to reflect.

// A CTA click is this product's own established conversion signal
// (Phase 6 analytics, D7) — weighted heaviest since it's the strongest
// single behavioral signal. Distinct pages viewed (active research)
// outweighs repeat views of the same page (passive browsing).
const PAGE_VIEW_WEIGHT = 0.2;
const DISTINCT_PAGE_WEIGHT = 0.3;
const CTA_CLICK_WEIGHT = 0.5;

// Caps beyond which more of the same signal stops adding to the score —
// a visitor with 50 page views isn't 5x more "intent-showing" than one
// with 10.
const PAGE_VIEW_CAP = 10;
const DISTINCT_PAGE_CAP = 5;
const CTA_CLICK_CAP = 3;

export type IntentInput = {
  pageViewCount: number;
  ctaClickCount: number;
  distinctPages: number;
};

function cappedRatio(value: number, cap: number): number {
  return Math.min(Math.max(value, 0), cap) / cap;
}

export function computeIntentScore(input: IntentInput): number {
  const score =
    PAGE_VIEW_WEIGHT * cappedRatio(input.pageViewCount, PAGE_VIEW_CAP) +
    DISTINCT_PAGE_WEIGHT * cappedRatio(input.distinctPages, DISTINCT_PAGE_CAP) +
    CTA_CLICK_WEIGHT * cappedRatio(input.ctaClickCount, CTA_CLICK_CAP);

  return Math.min(Math.max(score, 0), 1);
}

export type VisitorStage = "awareness" | "consideration" | "evaluation";

const CONSIDERATION_THRESHOLD = 0.33;
const EVALUATION_THRESHOLD = 0.66;

export function stageForIntent(score: number): VisitorStage {
  if (score >= EVALUATION_THRESHOLD) return "evaluation";
  if (score >= CONSIDERATION_THRESHOLD) return "consideration";
  return "awareness";
}
