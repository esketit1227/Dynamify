import { describe, it, expect } from "vitest";
import { extractClaims, checkClaimsAgainstCorpus } from "@/lib/sites/suggestVariant";

describe("extractClaims", () => {
  it("extracts numbers and percentages", () => {
    const claims = extractClaims("Trusted by 500 companies with 99.9% uptime.");
    expect(claims).toContain("500");
    expect(claims).toContain("99.9%");
  });

  it("extracts mid-sentence capitalized word runs (likely proper nouns)", () => {
    const claims = extractClaims("Powering teams at Deutsche Telekom and Acme Corp worldwide.");
    expect(claims).toContain("Deutsche Telekom");
    expect(claims).toContain("Acme Corp");
  });

  it("does not flag ordinary sentence-initial capitalization", () => {
    const claims = extractClaims("Build faster. Ship sooner. Grow with confidence.");
    expect(claims).toEqual([]);
  });

  it("handles multiple sentences independently", () => {
    const claims = extractClaims("We help teams ship. Trusted by Cisco worldwide. Built for scale.");
    expect(claims).toContain("Cisco");
    expect(claims).not.toContain("We");
    expect(claims).not.toContain("Built");
  });
});

describe("checkClaimsAgainstCorpus", () => {
  const corpus = "ElevenLabs powers voice AI for Cisco, Revolut, and Deutsche Telekom. Trusted by 500 teams.";

  it("passes when every claim appears somewhere in the corpus", () => {
    const result = checkClaimsAgainstCorpus("Trusted by Cisco and 500 teams worldwide.", corpus);
    expect(result.safe).toBe(true);
  });

  it("is case-insensitive when matching against the corpus", () => {
    const result = checkClaimsAgainstCorpus("Trusted by CISCO worldwide.", corpus);
    expect(result.safe).toBe(true);
  });

  it("fails when a claim doesn't appear anywhere in the corpus", () => {
    const result = checkClaimsAgainstCorpus("Trusted by Google and Microsoft worldwide.", corpus);
    expect(result.safe).toBe(false);
    if (!result.safe) expect(result.violation).toBe("Google");
  });

  it("fails on an invented statistic not present in the corpus", () => {
    const result = checkClaimsAgainstCorpus("Now trusted by over 10000 companies.", corpus);
    expect(result.safe).toBe(false);
    if (!result.safe) expect(result.violation).toBe("10000");
  });

  it("passes plain rewrites with no proper nouns or numbers at all", () => {
    const result = checkClaimsAgainstCorpus("Built for teams that move fast.", corpus);
    expect(result.safe).toBe(true);
  });
});
