import { describe, it, expect } from "vitest";
import { selectBanditArm } from "@/lib/experiments/bandit";

describe("selectBanditArm", () => {
  it("is deterministic for the same visitor and experiment", () => {
    const first = selectBanditArm("exp-1", "visitor-abc123", 0.5);
    for (let i = 0; i < 20; i++) {
      expect(selectBanditArm("exp-1", "visitor-abc123", 0.5)).toBe(first);
    }
  });

  it("always returns A at weightA=1 and B at weightA=0", () => {
    for (let i = 0; i < 200; i++) {
      expect(selectBanditArm("exp-1", `visitor-${i}`, 1)).toBe("A");
      expect(selectBanditArm("exp-1", `visitor-${i}`, 0)).toBe("B");
    }
  });

  it("splits a large population roughly proportional to weightA", () => {
    const TOTAL = 20000;
    const WEIGHT_A = 0.7;
    let armA = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (selectBanditArm("exp-1", `visitor-${i}`, WEIGHT_A) === "A") armA++;
    }
    const share = armA / TOTAL;
    // Loose tolerance — a distribution sanity check, not a precise
    // statistical claim about the hash function (same posture as
    // holdout.test.ts's equivalent test).
    expect(share).toBeGreaterThan(0.65);
    expect(share).toBeLessThan(0.75);
  });

  it("different experiment ids for the same visitor don't all collapse to one arm", () => {
    const results = new Set(
      Array.from({ length: 50 }, (_, i) => selectBanditArm(`exp-${i}`, "same-visitor", 0.5)),
    );
    expect(results.size).toBe(2); // both A and B actually occur — experiments don't correlate
  });

  it("the same visitor can land on different arms across different experiments", () => {
    // Not a hard guarantee for every possible pair, but with 50 distinct
    // experiment ids for one visitor it would be a real bug if salting by
    // experimentId had no effect at all.
    const armForExp1 = selectBanditArm("exp-alpha", "visitor-x", 0.5);
    const differsSomewhere = Array.from({ length: 50 }, (_, i) => selectBanditArm(`exp-beta-${i}`, "visitor-x", 0.5)).some(
      (arm) => arm !== armForExp1,
    );
    expect(differsSomewhere).toBe(true);
  });
});
