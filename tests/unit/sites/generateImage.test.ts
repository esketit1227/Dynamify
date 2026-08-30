import { describe, it, expect } from "vitest";
import { describeAudience, buildImagePrompt } from "@/lib/sites/generateImage";

describe("describeAudience", () => {
  it("formats a single rule in plain language", () => {
    expect(describeAudience([{ field: "device", operator: "EQUALS", value: "mobile" }])).toBe(
      "device equals mobile",
    );
  });

  it("joins multiple rules", () => {
    const description = describeAudience([
      { field: "device", operator: "EQUALS", value: "mobile" },
      { field: "utm.source", operator: "EQUALS", value: "linkedin" },
    ]);
    expect(description).toBe("device equals mobile, utm.source equals linkedin");
  });

  it("formats a multi-word operator readably", () => {
    expect(describeAudience([{ field: "sessionCount", operator: "GREATER_THAN", value: 3 }])).toBe(
      "sessionCount greater than 3",
    );
  });

  it("returns a sensible default for an audience with no rules", () => {
    expect(describeAudience([])).toBe("a general visitor");
  });
});

describe("buildImagePrompt", () => {
  const understanding = {
    companySummary: "Dynamify personalizes websites.",
    productSummary: "An AI personalization platform.",
    brandTone: { tone: ["professional", "confident"], vocabulary: [], formality: "formal" },
  };

  it("includes company, product, and brand tone when understanding is available", () => {
    const prompt = buildImagePrompt({
      elementSection: "HERO",
      understanding,
      audienceDescription: "device equals mobile",
    });
    expect(prompt).toContain("Dynamify personalizes websites.");
    expect(prompt).toContain("An AI personalization platform.");
    expect(prompt).toContain("professional, confident");
    expect(prompt).toContain("device equals mobile");
  });

  it("still produces a usable prompt with no understanding at all", () => {
    const prompt = buildImagePrompt({
      elementSection: "HERO",
      understanding: null,
      audienceDescription: "a general visitor",
    });
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("a general visitor");
  });

  it("includes an optional human-written brief when given", () => {
    const prompt = buildImagePrompt({
      elementSection: "HERO",
      understanding: null,
      audienceDescription: "a general visitor",
      brief: "more enterprise-focused",
    });
    expect(prompt).toContain("more enterprise-focused");
  });

  it("mentions the element's section", () => {
    const prompt = buildImagePrompt({
      elementSection: "FEATURES",
      understanding: null,
      audienceDescription: "a general visitor",
    });
    expect(prompt.toLowerCase()).toContain("features");
  });
});
