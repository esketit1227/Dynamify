import { describe, it, expect } from "vitest";
import { summarizeHistoricalResults, type PastResult } from "@/lib/experiments/history";

function pastResult(overrides: Partial<PastResult> = {}): PastResult {
  return {
    section: "HERO",
    elementType: "HEADLINE",
    audienceName: "Mobile visitors",
    winningContent: "The shoes TikTok can't stop talking about.",
    losingContent: "Premium everyday footwear.",
    winningRate: 0.61,
    losingRate: 0.24,
    ...overrides,
  };
}

describe("summarizeHistoricalResults", () => {
  it("returns an empty string for no results, so callers can skip appending it", () => {
    expect(summarizeHistoricalResults([])).toBe("");
  });

  it("includes the section, element type, audience name, and both contents with rates", () => {
    const summary = summarizeHistoricalResults([pastResult()]);
    expect(summary).toContain("HERO/HEADLINE");
    expect(summary).toContain("Mobile visitors");
    expect(summary).toContain("The shoes TikTok can't stop talking about.");
    expect(summary).toContain("Premium everyday footwear.");
    expect(summary).toContain("61%");
    expect(summary).toContain("24%");
  });

  it("frames the block as guidance, not instruction — matching this codebase's AI-safety convention", () => {
    const summary = summarizeHistoricalResults([pastResult()]);
    expect(summary.toLowerCase()).toContain("not instructions to copy");
  });

  it("truncates an over-length past content string rather than blowing the prompt budget", () => {
    const summary = summarizeHistoricalResults([
      pastResult({ winningContent: "A".repeat(400), losingContent: "B".repeat(400) }),
    ]);
    const winningMatch = summary.match(/A+\.\.\./);
    const losingMatch = summary.match(/B+\.\.\./);
    expect(winningMatch?.[0].length).toBeLessThanOrEqual(200);
    expect(losingMatch?.[0].length).toBeLessThanOrEqual(200);
  });

  it("includes every result when several are given", () => {
    const summary = summarizeHistoricalResults([
      pastResult({ section: "HERO", elementType: "HEADLINE" }),
      pastResult({ section: "CTA", elementType: "CTA_LABEL", audienceName: "Returning visitors" }),
    ]);
    expect(summary).toContain("HERO/HEADLINE");
    expect(summary).toContain("CTA/CTA_LABEL");
    expect(summary).toContain("Returning visitors");
  });
});
