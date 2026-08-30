import { describe, it, expect } from "vitest";
import { shouldHoldOut } from "@/lib/experiments/holdout";

describe("shouldHoldOut", () => {
  it("never holds out at 0% regardless of seed", () => {
    for (let i = 0; i < 200; i++) {
      expect(shouldHoldOut(`visitor-${i}`, 0)).toBe(false);
    }
  });

  it("always holds out at 100%", () => {
    for (let i = 0; i < 200; i++) {
      expect(shouldHoldOut(`visitor-${i}`, 100)).toBe(true);
    }
  });

  it("is deterministic for the same seed and holdbackPercent", () => {
    const seed = "stable-visitor-key-abc123";
    const first = shouldHoldOut(seed, 30);
    for (let i = 0; i < 20; i++) {
      expect(shouldHoldOut(seed, 30)).toBe(first);
    }
  });

  it("splits a large population roughly proportional to holdbackPercent", () => {
    const TOTAL = 20000;
    const HOLDBACK = 30;
    let heldOut = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (shouldHoldOut(`visitor-${i}`, HOLDBACK)) heldOut++;
    }
    const share = heldOut / TOTAL;
    // Loose tolerance — this is a distribution sanity check, not a
    // precise statistical claim about the hash function.
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.35);
  });

  it("different seeds are not all assigned to the same bucket", () => {
    const results = new Set(
      Array.from({ length: 50 }, (_, i) => shouldHoldOut(`visitor-${i}`, 50)),
    );
    expect(results.size).toBe(2); // both true and false actually occur
  });
});
