import { describe, it, expect } from "vitest";
import { computeWeightA, sampleBeta, MIN_BANDIT_SAMPLE } from "@/lib/experiments/banditStats";

describe("sampleBeta", () => {
  it("Beta(1,1) — the uninformative prior — averages close to 0.5 over many draws", () => {
    const N = 20000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(1, 1);
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
  });

  it("a strongly-informed posterior (many successes) skews close to 1", () => {
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(950, 50); // ~95% observed rate, real sample size
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.9);
  });

  it("a strongly-informed posterior (few successes) skews close to 0", () => {
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(50, 950);
    const mean = sum / N;
    expect(mean).toBeLessThan(0.1);
  });

  it("always returns a value in [0, 1]", () => {
    for (let i = 0; i < 2000; i++) {
      const v = sampleBeta(3, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeWeightA", () => {
  it("stays at exactly 0.5 when either arm is below MIN_BANDIT_SAMPLE, no matter how lopsided", () => {
    expect(computeWeightA({ trials: MIN_BANDIT_SAMPLE - 1, successes: MIN_BANDIT_SAMPLE - 1 }, { trials: 500, successes: 0 })).toBe(0.5);
    expect(computeWeightA({ trials: 500, successes: 400 }, { trials: MIN_BANDIT_SAMPLE - 1, successes: 0 })).toBe(0.5);
    expect(computeWeightA({ trials: 0, successes: 0 }, { trials: 0, successes: 0 })).toBe(0.5);
  });

  it("shifts toward the clearly better-performing arm once both clear the threshold", () => {
    // Arm A: 40% conversion over a real sample; Arm B: 5%.
    const weightA = computeWeightA({ trials: 200, successes: 80 }, { trials: 200, successes: 10 });
    expect(weightA).toBeGreaterThan(0.7);
  });

  it("shifts toward B when B is clearly better", () => {
    const weightA = computeWeightA({ trials: 200, successes: 10 }, { trials: 200, successes: 80 });
    expect(weightA).toBeLessThan(0.3);
  });

  it("never goes below 0.1 or above 0.9, even for an overwhelming difference", () => {
    const weightA = computeWeightA({ trials: 5000, successes: 4500 }, { trials: 5000, successes: 5 });
    expect(weightA).toBeLessThanOrEqual(0.9);
    const weightAInverse = computeWeightA({ trials: 5000, successes: 5 }, { trials: 5000, successes: 4500 });
    expect(weightAInverse).toBeGreaterThanOrEqual(0.1);
  });

  it("stays close to 0.5 for two arms performing about the same", () => {
    const weightA = computeWeightA({ trials: 500, successes: 50 }, { trials: 500, successes: 52 });
    expect(weightA).toBeGreaterThan(0.3);
    expect(weightA).toBeLessThan(0.7);
  });
});
