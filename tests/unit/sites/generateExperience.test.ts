import { describe, it, expect } from "vitest";
import { filterEligibleElements, buildExperiencePrompt } from "@/lib/sites/generateExperience";

type TestElement = {
  id: string;
  elementType:
    | "HEADLINE"
    | "SUBHEADLINE"
    | "BODY"
    | "IMAGE"
    | "CTA_LABEL"
    | "CTA_HREF"
    | "LOGO"
    | "NAV_LABEL"
    | "OTHER";
  personalizationBoundary: "ALLOWED" | "RESTRICTED" | "NEVER" | null;
};

describe("filterEligibleElements", () => {
  it("excludes a NEVER-boundary element regardless of acknowledgedRestricted", () => {
    const elements: TestElement[] = [{ id: "1", elementType: "LOGO", personalizationBoundary: null }];
    expect(filterEligibleElements(elements, false)).toEqual([]);
    expect(filterEligibleElements(elements, true)).toEqual([]);
  });

  it("excludes a RESTRICTED-boundary element unless acknowledged", () => {
    const elements: TestElement[] = [{ id: "1", elementType: "NAV_LABEL", personalizationBoundary: null }];
    expect(filterEligibleElements(elements, false)).toEqual([]);
    expect(filterEligibleElements(elements, true)).toEqual(elements);
  });

  it("always includes an ALLOWED-boundary element", () => {
    const elements: TestElement[] = [{ id: "1", elementType: "HEADLINE", personalizationBoundary: null }];
    expect(filterEligibleElements(elements, false)).toEqual(elements);
    expect(filterEligibleElements(elements, true)).toEqual(elements);
  });

  it("an explicit per-element override wins over the type default", () => {
    const overriddenNever: TestElement[] = [{ id: "1", elementType: "HEADLINE", personalizationBoundary: "NEVER" }];
    expect(filterEligibleElements(overriddenNever, true)).toEqual([]);

    const overriddenAllowed: TestElement[] = [{ id: "1", elementType: "LOGO", personalizationBoundary: "ALLOWED" }];
    expect(filterEligibleElements(overriddenAllowed, false)).toEqual(overriddenAllowed);
  });

  it("filters a mixed batch down to only the eligible elements, preserving order", () => {
    const elements: TestElement[] = [
      { id: "headline", elementType: "HEADLINE", personalizationBoundary: null },
      { id: "logo", elementType: "LOGO", personalizationBoundary: null },
      { id: "nav", elementType: "NAV_LABEL", personalizationBoundary: null },
      { id: "cta", elementType: "CTA_LABEL", personalizationBoundary: null },
    ];
    expect(filterEligibleElements(elements, false).map((e) => e.id)).toEqual(["headline", "cta"]);
    expect(filterEligibleElements(elements, true).map((e) => e.id)).toEqual(["headline", "nav", "cta"]);
  });
});

describe("buildExperiencePrompt", () => {
  const elements = [
    { id: "el1", elementType: "HEADLINE" as const, section: "HERO" as const, currentContent: "Welcome to Acme" },
    { id: "el2", elementType: "CTA_LABEL" as const, section: "HERO" as const, currentContent: "Get started" },
  ];

  it("includes every element's id, type, section, and current content", () => {
    const prompt = buildExperiencePrompt(elements, null, "mobile visitors");
    for (const el of elements) {
      expect(prompt).toContain(el.id);
      expect(prompt).toContain(el.elementType);
      expect(prompt).toContain(el.section);
      expect(prompt).toContain(el.currentContent);
    }
  });

  it("includes the audience description", () => {
    const prompt = buildExperiencePrompt(elements, null, "mobile visitors from LinkedIn");
    expect(prompt).toContain("mobile visitors from LinkedIn");
  });

  it("includes brand context when understanding is available", () => {
    const prompt = buildExperiencePrompt(elements, {
      companySummary: "Acme builds rockets",
      productSummary: "A rocket-building platform",
      targetCustomers: "Aerospace engineers",
    }, "a general visitor");
    expect(prompt).toContain("Acme builds rockets");
    expect(prompt).toContain("A rocket-building platform");
    expect(prompt).toContain("Aerospace engineers");
  });

  it("degrades gracefully with no brand context, rather than throwing", () => {
    const prompt = buildExperiencePrompt(elements, null, "a general visitor");
    expect(prompt).toContain("No additional brand context available.");
  });
});
