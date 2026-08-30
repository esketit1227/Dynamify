import { describe, it, expect } from "vitest";
import { twoProportionZTest, MIN_GROUP_SIZE } from "@/lib/analytics/significance";

describe("twoProportionZTest", () => {
  it("returns null when either group is below the minimum sample size", () => {
    expect(twoProportionZTest({ conversions: 5, total: 10 }, { conversions: 50, total: 100 })).toBeNull();
    expect(twoProportionZTest({ conversions: 50, total: 100 }, { conversions: 5, total: 10 })).toBeNull();
  });

  it("is exactly at the boundary: MIN_GROUP_SIZE qualifies, one below does not", () => {
    const atBoundary = twoProportionZTest(
      { conversions: 10, total: MIN_GROUP_SIZE },
      { conversions: 10, total: MIN_GROUP_SIZE },
    );
    expect(atBoundary).not.toBeNull();

    const belowBoundary = twoProportionZTest(
      { conversions: 10, total: MIN_GROUP_SIZE - 1 },
      { conversions: 10, total: MIN_GROUP_SIZE },
    );
    expect(belowBoundary).toBeNull();
  });

  it("finds a clear, large, real difference significant", () => {
    // 1000 samples each, 10% vs 30% conversion — an obvious real effect.
    const result = twoProportionZTest(
      { conversions: 100, total: 1000 },
      { conversions: 300, total: 1000 },
    );
    expect(result).not.toBeNull();
    expect(result!.significant).toBe(true);
    expect(result!.direction).toBe("higher");
    expect(result!.pValue).toBeLessThan(0.001);
  });

  it("does not call a small, plausibly-noise difference significant", () => {
    // 100 samples each, 20% vs 22% — well within noise at this sample size.
    const result = twoProportionZTest(
      { conversions: 20, total: 100 },
      { conversions: 22, total: 100 },
    );
    expect(result).not.toBeNull();
    expect(result!.significant).toBe(false);
    expect(result!.direction).toBe("no_difference");
  });

  it("detects a significant regression (treatment converts lower than control)", () => {
    const result = twoProportionZTest(
      { conversions: 300, total: 1000 },
      { conversions: 100, total: 1000 },
    );
    expect(result).not.toBeNull();
    expect(result!.significant).toBe(true);
    expect(result!.direction).toBe("lower");
  });

  it("handles identical zero-conversion groups without dividing by zero", () => {
    const result = twoProportionZTest({ conversions: 0, total: 100 }, { conversions: 0, total: 100 });
    expect(result).toEqual({ zScore: 0, pValue: 1, significant: false, direction: "no_difference" });
  });

  it("is symmetric: swapping which group is control flips the direction, not the significance", () => {
    const a = twoProportionZTest({ conversions: 100, total: 1000 }, { conversions: 300, total: 1000 });
    const b = twoProportionZTest({ conversions: 300, total: 1000 }, { conversions: 100, total: 1000 });
    expect(a!.significant).toBe(b!.significant);
    expect(a!.direction).toBe("higher");
    expect(b!.direction).toBe("lower");
  });
});
