import { describe, it, expect } from "vitest";
import {
  pageDesignSectionSchema,
  pageDesignSectionsSchema,
  parseStoredSections,
  enforceTestimonialAuthenticity,
  composeHeuristicDesign,
  buildPageDesignPrompt,
  buildSearchQuery,
  buildMarketSynthesisPrompt,
  designTextForSafetyCheck,
  marketSourceSchema,
  marketSourcesSchema,
  parseStoredMarketSources,
  DESIGNABLE_SECTIONS,
  PAGE_DESIGN_LAYOUTS,
  type PageDesignSection,
} from "@/lib/sites/designPage";
import type { SearchResult } from "@/lib/search/tavily";

describe("pageDesignSectionSchema", () => {
  it("accepts a minimal valid HERO_CENTERED section", () => {
    const result = pageDesignSectionSchema.safeParse({
      section: "HERO",
      layout: "HERO_CENTERED",
      headline: "Welcome to Acme",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a layout that isn't legal for its section", () => {
    const result = pageDesignSectionSchema.safeParse({
      section: "HERO",
      layout: "FEATURES_GRID",
      headline: "Welcome to Acme",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a section outside DESIGNABLE_SECTIONS", () => {
    const result = pageDesignSectionSchema.safeParse({
      section: "PRICING",
      layout: "HERO_CENTERED",
      headline: "Plans",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown layout", () => {
    const result = pageDesignSectionSchema.safeParse({
      section: "HERO",
      layout: "HERO_FULLSCREEN_VIDEO",
      headline: "Welcome",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a section with no content at all", () => {
    const result = pageDesignSectionSchema.safeParse({ section: "HERO", layout: "HERO_CENTERED" });
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: scheme in ctaLabel", () => {
    const result = pageDesignSectionSchema.safeParse({
      section: "CTA",
      layout: "CTA_BANNER",
      ctaLabel: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a data: scheme in imageDescription", () => {
    const result = pageDesignSectionSchema.safeParse({
      section: "HERO",
      layout: "HERO_SPLIT",
      headline: "Welcome",
      imageDescription: "data:text/html,<script>",
    });
    expect(result.success).toBe(false);
  });
});

describe("pageDesignSectionsSchema", () => {
  const hero: PageDesignSection = { section: "HERO", layout: "HERO_CENTERED", headline: "Welcome" };

  it("rejects a single-section array (min 2)", () => {
    expect(pageDesignSectionsSchema.safeParse([hero]).success).toBe(false);
  });

  it("rejects a 9-section array (max 8)", () => {
    const nine = Array.from({ length: 9 }, () => hero);
    expect(pageDesignSectionsSchema.safeParse(nine).success).toBe(false);
  });

  it("accepts a valid 2-section array", () => {
    const cta: PageDesignSection = { section: "CTA", layout: "CTA_BANNER", ctaLabel: "Get started" };
    expect(pageDesignSectionsSchema.safeParse([hero, cta]).success).toBe(true);
  });
});

describe("parseStoredSections", () => {
  it("returns [] for garbage input", () => {
    expect(parseStoredSections(null)).toEqual([]);
    expect(parseStoredSections("not an array")).toEqual([]);
    expect(parseStoredSections([{ section: "NOT_REAL" }])).toEqual([]);
  });

  it("round-trips a valid array", () => {
    const sections: PageDesignSection[] = [
      { section: "HERO", layout: "HERO_CENTERED", headline: "Welcome" },
      { section: "CTA", layout: "CTA_BANNER", ctaLabel: "Get started" },
    ];
    expect(parseStoredSections(sections)).toEqual(sections);
  });
});

describe("enforceTestimonialAuthenticity", () => {
  const realQuotes = ["This product changed how we work.", "Best investment we made this year."];

  it("drops a TESTIMONIALS section whose quotes are all fabricated", () => {
    const sections: PageDesignSection[] = [
      { section: "TESTIMONIALS", layout: "TESTIMONIALS_QUOTE", quotes: ["Amazing, life-changing stuff!"] },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections).toEqual([]);
    expect(result.droppedSections).toBe(1);
    expect(result.droppedQuotes).toBe(1);
  });

  it("keeps only the real subset when quotes are mixed", () => {
    const sections: PageDesignSection[] = [
      {
        section: "TESTIMONIALS",
        layout: "TESTIMONIALS_GRID",
        quotes: [realQuotes[0], "A totally invented quote.", realQuotes[1]],
      },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].quotes).toEqual(realQuotes);
    expect(result.droppedQuotes).toBe(1);
  });

  it("matches despite smart quotes, extra whitespace, and case differences", () => {
    const reworded = "“This  Product Changed How We Work.”";
    const sections: PageDesignSection[] = [
      { section: "TESTIMONIALS", layout: "TESTIMONIALS_QUOTE", quotes: [reworded] },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections).toHaveLength(1);
    expect(result.droppedQuotes).toBe(0);
  });

  it("strips a quotes array smuggled onto a non-testimonials section", () => {
    const sections: PageDesignSection[] = [
      { section: "FEATURES", layout: "FEATURES_GRID", items: ["Fast", "Reliable"], quotes: ["Fake quote"] },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections[0].quotes).toBeUndefined();
    expect(result.droppedQuotes).toBe(1);
  });

  it("strips body/subheadline/items from a surviving TESTIMONIALS section", () => {
    const sections: PageDesignSection[] = [
      {
        section: "TESTIMONIALS",
        layout: "TESTIMONIALS_QUOTE",
        headline: "What customers say",
        body: "— Sarah, VP at Northwind",
        subheadline: "Loved by teams everywhere",
        items: ["invented stat"],
        quotes: [realQuotes[0]],
      },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections[0]).toEqual({
      section: "TESTIMONIALS",
      layout: "TESTIMONIALS_QUOTE",
      headline: "What customers say",
      quotes: [realQuotes[0]],
    });
  });

  it("flips layout to TESTIMONIALS_QUOTE when only 1-2 real quotes survive a _GRID", () => {
    const sections: PageDesignSection[] = [
      { section: "TESTIMONIALS", layout: "TESTIMONIALS_GRID", quotes: [realQuotes[0], "fabricated"] },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections[0].layout).toBe("TESTIMONIALS_QUOTE");
  });

  it("returns a clean set unchanged (no drops)", () => {
    const sections: PageDesignSection[] = [
      { section: "HERO", layout: "HERO_CENTERED", headline: "Welcome" },
      { section: "TESTIMONIALS", layout: "TESTIMONIALS_QUOTE", quotes: [realQuotes[0]] },
    ];
    const result = enforceTestimonialAuthenticity(sections, realQuotes);
    expect(result.sections).toEqual(sections);
    expect(result.droppedSections).toBe(0);
    expect(result.droppedQuotes).toBe(0);
  });
});

describe("composeHeuristicDesign", () => {
  const understanding = {
    companySummary: "Acme sells project management software.",
    productSummary: "A tool for teams to track work. It ships fast.",
    targetCustomers: "Small software teams.",
    valueProps: ["Ship faster", "Stay organized"],
    primaryCta: "Start free trial",
  };

  it("builds HERO from the first real HEADLINE/SUBHEADLINE/CTA_LABEL", () => {
    const sections = composeHeuristicDesign({
      understanding,
      elements: [
        { section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" },
        { section: "HERO", elementType: "SUBHEADLINE", currentContent: "Manage your team's work" },
        { section: "HERO", elementType: "CTA_LABEL", currentContent: "Get started" },
      ],
      realTestimonials: [],
    });
    const hero = sections.find((s) => s.section === "HERO");
    expect(hero).toMatchObject({
      headline: "Welcome to Acme",
      subheadline: "Manage your team's work",
      ctaLabel: "Get started",
    });
  });

  it("omits TESTIMONIALS entirely when realTestimonials is empty", () => {
    const sections = composeHeuristicDesign({
      understanding,
      elements: [
        { section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" },
        { section: "FEATURES", elementType: "BODY", currentContent: "Real-time collaboration for every team." },
        { section: "FEATURES", elementType: "BODY", currentContent: "Deep integrations with your existing tools." },
      ],
      realTestimonials: [],
    });
    expect(sections.some((s) => s.section === "TESTIMONIALS")).toBe(false);
  });

  it("emits TESTIMONIALS_QUOTE for 1-2 real quotes, verbatim", () => {
    const sections = composeHeuristicDesign({
      understanding,
      elements: [{ section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" }],
      realTestimonials: ["This tool changed everything for our team."],
    });
    const testimonials = sections.find((s) => s.section === "TESTIMONIALS");
    expect(testimonials?.layout).toBe("TESTIMONIALS_QUOTE");
    expect(testimonials?.quotes).toEqual(["This tool changed everything for our team."]);
  });

  it("emits TESTIMONIALS_GRID for 3+ real quotes", () => {
    const quotes = ["Quote one is great.", "Quote two is great.", "Quote three is great."];
    const sections = composeHeuristicDesign({
      understanding,
      elements: [{ section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" }],
      realTestimonials: quotes,
    });
    const testimonials = sections.find((s) => s.section === "TESTIMONIALS");
    expect(testimonials?.layout).toBe("TESTIMONIALS_GRID");
    expect(testimonials?.quotes).toEqual(quotes);
  });

  it("invariant: every emitted string appears verbatim somewhere in the input — never invents", () => {
    const elements: { section: "HERO" | "FEATURES" | "TESTIMONIALS" | "CTA"; elementType: "HEADLINE" | "SUBHEADLINE" | "BODY" | "CTA_LABEL"; currentContent: string }[] = [
      { section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" },
      { section: "HERO", elementType: "SUBHEADLINE", currentContent: "Manage your team's work" },
      { section: "FEATURES", elementType: "BODY", currentContent: "Real-time collaboration for every team." },
      { section: "FEATURES", elementType: "BODY", currentContent: "Deep integrations with your existing tools." },
      { section: "CTA", elementType: "CTA_LABEL", currentContent: "Start your free trial" },
    ];
    const realTestimonials = ["This tool changed everything for our team."];
    const sections = composeHeuristicDesign({ understanding, elements, realTestimonials });

    const inputStrings = new Set<string>([
      ...elements.map((e) => e.currentContent),
      ...(understanding.valueProps as string[]),
      understanding.primaryCta,
      ...realTestimonials,
    ]);
    // firstSentence(productSummary) is a real substring of a real field, not
    // a separate invented string — allow it explicitly.
    inputStrings.add("A tool for teams to track work.");

    for (const section of sections) {
      for (const value of [section.headline, section.subheadline, section.body, section.ctaLabel]) {
        if (value) expect(inputStrings.has(value)).toBe(true);
      }
      for (const value of [...(section.items ?? []), ...(section.quotes ?? [])]) {
        expect(inputStrings.has(value)).toBe(true);
      }
    }
  });

  it("returns fewer than 2 sections for a near-empty page", () => {
    const sections = composeHeuristicDesign({
      understanding: null,
      elements: [{ section: "OTHER", elementType: "OTHER", currentContent: "x" }],
      realTestimonials: [],
    });
    expect(sections.length).toBeLessThan(2);
  });

  it("is deterministic — same input twice produces the same output", () => {
    const input = {
      understanding,
      elements: [
        { section: "HERO" as const, elementType: "HEADLINE" as const, currentContent: "Welcome to Acme" },
        { section: "FEATURES" as const, elementType: "BODY" as const, currentContent: "Fast and reliable." },
        { section: "FEATURES" as const, elementType: "BODY" as const, currentContent: "Built for teams." },
      ],
      realTestimonials: ["Great product overall."],
    };
    expect(composeHeuristicDesign(input)).toEqual(composeHeuristicDesign(input));
  });
});

describe("buildPageDesignPrompt", () => {
  const understanding = {
    companySummary: "Acme sells project management software.",
    productSummary: "A tool for teams to track work.",
    targetCustomers: "Small software teams.",
    valueProps: ["Ship faster"],
    primaryCta: "Start free trial",
  };

  it("includes every element's content and section, and the allowed-section list", () => {
    const prompt = buildPageDesignPrompt({
      pageUrl: "https://example.com",
      understanding,
      elements: [{ section: "HERO", elementType: "HEADLINE", currentContent: "Welcome to Acme" }],
      realTestimonials: [],
      marketContext: "General SaaS positioning notes.",
      allowedSections: ["HERO", "FEATURES", "CTA"],
    });
    expect(prompt).toContain("Welcome to Acme");
    expect(prompt).toContain("HERO");
    expect(prompt).toContain("General SaaS positioning notes.");
    expect(prompt).toContain("HERO, FEATURES, CTA");
  });

  it("does not list TESTIMONIALS as allowed when realTestimonials is empty", () => {
    const prompt = buildPageDesignPrompt({
      pageUrl: "https://example.com",
      understanding,
      elements: [],
      realTestimonials: [],
      marketContext: "",
      allowedSections: ["HERO", "FEATURES", "CTA"],
    });
    expect(prompt).not.toContain("Section types you are allowed to use: HERO, FEATURES, TESTIMONIALS, CTA");
    expect(prompt).toContain("None found on this site.");
  });
});

describe("buildSearchQuery / buildMarketSynthesisPrompt", () => {
  const understanding = {
    companySummary: "Acme sells project management software.",
    productSummary: "A tool for teams to track work.",
    targetCustomers: "Small software teams.",
    valueProps: ["Ship faster"],
    primaryCta: "Start free trial",
  };
  const results: SearchResult[] = [
    { title: "Best Acme alternatives in 2026", url: "https://example.com/acme-alternatives", content: "Acme competes with Widgetly and TaskFlow in the small-team PM space." },
  ];

  it("buildSearchQuery is derived from the company summary", () => {
    expect(buildSearchQuery(understanding)).toContain(understanding.companySummary);
  });

  it("buildMarketSynthesisPrompt contains the company/product/target summaries and the real results", () => {
    const prompt = buildMarketSynthesisPrompt(understanding, results);
    expect(prompt).toContain(understanding.companySummary);
    expect(prompt).toContain(understanding.productSummary);
    expect(prompt).toContain(understanding.targetCustomers);
    expect(prompt).toContain("Best Acme alternatives in 2026");
    expect(prompt).toContain("https://example.com/acme-alternatives");
    expect(prompt).toContain("Widgetly");
  });
});

describe("marketSourceSchema / marketSourcesSchema", () => {
  it("accepts a valid http(s) source", () => {
    expect(marketSourceSchema.safeParse({ title: "Acme vs. Widgetly", url: "https://example.com/compare" }).success).toBe(true);
  });

  it("rejects a javascript: URL", () => {
    expect(marketSourceSchema.safeParse({ title: "x", url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(marketSourceSchema.safeParse({ title: "x", url: "data:text/html,<script>" }).success).toBe(false);
  });

  it("caps sources at 5", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ title: `Source ${i}`, url: `https://example.com/${i}` }));
    expect(marketSourcesSchema.safeParse(six).success).toBe(false);
  });
});

describe("parseStoredMarketSources", () => {
  it("returns [] for garbage input", () => {
    expect(parseStoredMarketSources(null)).toEqual([]);
    expect(parseStoredMarketSources([{ url: "javascript:alert(1)", title: "x" }])).toEqual([]);
  });

  it("round-trips a valid array", () => {
    const sources = [{ title: "Acme vs. Widgetly", url: "https://example.com/compare" }];
    expect(parseStoredMarketSources(sources)).toEqual(sources);
  });
});

describe("designTextForSafetyCheck", () => {
  it("includes every text field and excludes quotes", () => {
    const sections: PageDesignSection[] = [
      { section: "HERO", layout: "HERO_CENTERED", headline: "Welcome", subheadline: "Sub", body: "Body text", ctaLabel: "Go" },
      { section: "FEATURES", layout: "FEATURES_GRID", items: ["Fast", "Reliable"] },
      { section: "TESTIMONIALS", layout: "TESTIMONIALS_QUOTE", quotes: ["A real quote from a customer"] },
    ];
    const text = designTextForSafetyCheck(sections);
    expect(text).toContain("Welcome");
    expect(text).toContain("Sub");
    expect(text).toContain("Body text");
    expect(text).toContain("Go");
    expect(text).toContain("Fast");
    expect(text).toContain("Reliable");
    expect(text).not.toContain("A real quote from a customer");
  });
});

describe("closed vocabulary", () => {
  it("every DESIGNABLE_SECTION has at least one legal layout in PAGE_DESIGN_LAYOUTS", () => {
    for (const section of DESIGNABLE_SECTIONS) {
      expect(PAGE_DESIGN_LAYOUTS.some((l) => l.startsWith(section === "CTA" ? "CTA" : section))).toBe(true);
    }
  });
});
