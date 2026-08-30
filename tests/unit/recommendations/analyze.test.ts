import { describe, it, expect } from "vitest";
import { analyzeSegments, MIN_SAMPLE_SIZE, MIN_SHARE } from "@/lib/recommendations/analyze";
import type { VisitorContext } from "@dynamify/personalization-sdk";

function contexts(overrides: Partial<VisitorContext>[]): VisitorContext[] {
  return overrides.map((o) => ({ ...o }));
}

describe("analyzeSegments", () => {
  it("surfaces a segment that clears both the sample-size and share thresholds", () => {
    const events = contexts([
      ...Array(12).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const candidates = analyzeSegments(events);
    const mobile = candidates.find((c) => c.field === "device" && c.value === "mobile");
    expect(mobile).toBeDefined();
    expect(mobile?.matchingEvents).toBe(12);
    expect(mobile?.totalEvents).toBe(30);
    expect(mobile?.share).toBeCloseTo(0.4);
  });

  it("does not surface anything below the minimum sample size, even at 100% share", () => {
    const events = contexts(Array(MIN_SAMPLE_SIZE - 1).fill({ device: "mobile" }));
    expect(analyzeSegments(events)).toEqual([]);
  });

  it("does not surface a segment below the minimum share", () => {
    const events = contexts([
      ...Array(2).fill({ device: "mobile" }),
      ...Array(18).fill({ device: "desktop" }),
    ]);
    const candidates = analyzeSegments(events);
    expect(candidates.find((c) => c.field === "device" && c.value === "mobile")).toBeUndefined();
    // sanity: 2/20 is below MIN_SHARE
    expect(2 / 20).toBeLessThan(MIN_SHARE);
  });

  it("reduces a referrer URL to a bare domain, stripping www", () => {
    const events = contexts([
      ...Array(15).fill({ referrer: "https://www.linkedin.com/feed/" }),
      ...Array(5).fill({ referrer: "https://news.ycombinator.com/item?id=1" }),
    ]);
    const candidates = analyzeSegments(events);
    const linkedin = candidates.find((c) => c.field === "referrer");
    expect(linkedin?.value).toBe("linkedin.com");
    expect(linkedin?.matchingEvents).toBe(15);
  });

  it("ignores an unparseable referrer rather than throwing", () => {
    const events = contexts([
      ...Array(9).fill({ referrer: "not-a-url" }),
      ...Array(1).fill({ device: "mobile" }),
    ]);
    expect(() => analyzeSegments(events)).not.toThrow();
    expect(analyzeSegments(events).find((c) => c.field === "referrer")).toBeUndefined();
  });

  it("analyzes every field independently in the same pass", () => {
    const events = contexts([
      ...Array(10).fill({ device: "mobile", utm: { source: "linkedin" } }),
      ...Array(10).fill({ device: "desktop", utm: { source: "google" } }),
    ]);
    const candidates = analyzeSegments(events);
    expect(candidates.some((c) => c.field === "device" && c.value === "mobile")).toBe(true);
    expect(candidates.some((c) => c.field === "utm.source" && c.value === "linkedin")).toBe(true);
  });

  it("sorts candidates by share, largest first", () => {
    const events = contexts([
      ...Array(16).fill({ device: "mobile" }),
      ...Array(4).fill({ device: "desktop", utm: { source: "linkedin" } }),
    ]);
    const candidates = analyzeSegments(events);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].share).toBeGreaterThanOrEqual(candidates[i].share);
    }
  });

  it("returns nothing for an empty traffic list", () => {
    expect(analyzeSegments([])).toEqual([]);
  });
});
