import { describe, it, expect } from "vitest";
import { computeIntentScore, stageForIntent } from "@/lib/visitors/inferProfile";

describe("computeIntentScore", () => {
  it("is 0 for a visitor with no activity at all", () => {
    expect(computeIntentScore({ pageViewCount: 0, ctaClickCount: 0, distinctPages: 0 })).toBe(0);
  });

  it("is 1 once every signal is at or beyond its cap", () => {
    expect(computeIntentScore({ pageViewCount: 10, ctaClickCount: 3, distinctPages: 5 })).toBeCloseTo(1);
  });

  it("never exceeds 1 even far beyond the caps", () => {
    expect(computeIntentScore({ pageViewCount: 1000, ctaClickCount: 1000, distinctPages: 1000 })).toBe(1);
  });

  it("weighs a CTA click more heavily than an equivalent amount of page views", () => {
    const fromClick = computeIntentScore({ pageViewCount: 0, ctaClickCount: 1, distinctPages: 0 });
    const fromView = computeIntentScore({ pageViewCount: 1, ctaClickCount: 0, distinctPages: 0 });
    expect(fromClick).toBeGreaterThan(fromView);
  });

  it("rewards distinct pages over repeat views of the same page", () => {
    const distinct = computeIntentScore({ pageViewCount: 3, ctaClickCount: 0, distinctPages: 3 });
    const repeat = computeIntentScore({ pageViewCount: 3, ctaClickCount: 0, distinctPages: 1 });
    expect(distinct).toBeGreaterThan(repeat);
  });

  it("never goes negative for negative-ish input", () => {
    expect(computeIntentScore({ pageViewCount: -5, ctaClickCount: 0, distinctPages: 0 })).toBe(0);
  });
});

describe("stageForIntent", () => {
  it("is awareness below the consideration threshold", () => {
    expect(stageForIntent(0)).toBe("awareness");
    expect(stageForIntent(0.32)).toBe("awareness");
  });

  it("is consideration between the two thresholds", () => {
    expect(stageForIntent(0.33)).toBe("consideration");
    expect(stageForIntent(0.65)).toBe("consideration");
  });

  it("is evaluation at or above the evaluation threshold", () => {
    expect(stageForIntent(0.66)).toBe("evaluation");
    expect(stageForIntent(1)).toBe("evaluation");
  });
});
