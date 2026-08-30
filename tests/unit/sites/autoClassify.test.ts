import { describe, it, expect } from "vitest";
import { classifyPageElements, buildHeuristicUnderstanding, deriveElementContent } from "@/lib/sites/autoClassify";
import type { RawElement } from "@/lib/sites/extract";
import type { CrawledPageResult } from "@/lib/sites/crawler";

function heading(id: string, text: string, order: number): RawElement {
  return { id, kind: "heading", tag: "h2", text, selector: `#${id}`, order };
}
function paragraph(id: string, text: string, order: number): RawElement {
  return { id, kind: "paragraph", tag: "p", text, selector: `#${id}`, order };
}
function cta(id: string, text: string, order: number): RawElement {
  return { id, kind: "cta", tag: "a", text, href: "/go", selector: `#${id}`, order };
}

describe("classifyPageElements", () => {
  it("classifies the first heading as HERO/HEADLINE and the second as HERO/SUBHEADLINE", () => {
    const elements = [heading("h1", "Main headline", 0), heading("h2", "Supporting line", 1)];
    const result = classifyPageElements("https://acme.com/", elements);
    expect(result[0]).toMatchObject({ section: "HERO", elementType: "HEADLINE" });
    expect(result[1]).toMatchObject({ section: "HERO", elementType: "SUBHEADLINE" });
  });

  it("classifies later headings as FEATURES by default", () => {
    const elements = [
      heading("h1", "Main", 0),
      heading("h2", "Sub", 1),
      heading("h3", "Some feature", 2),
    ];
    const result = classifyPageElements("https://acme.com/", elements);
    expect(result[2]).toMatchObject({ section: "FEATURES", elementType: "HEADLINE" });
  });

  it("classifies a question-shaped heading as FAQ", () => {
    const elements = [
      heading("h1", "Main", 0),
      heading("h2", "Sub", 1),
      heading("h3", "How does billing work?", 2),
    ];
    const result = classifyPageElements("https://acme.com/", elements);
    expect(result[2]).toMatchObject({ section: "FAQ", elementType: "HEADLINE" });
  });

  it("classifies headings on a pricing-URL page as PRICING (after the hero pair)", () => {
    const elements = [heading("h1", "Main", 0), heading("h2", "Sub", 1), heading("h3", "Pro plan", 2)];
    const result = classifyPageElements("https://acme.com/pricing", elements);
    expect(result[2]).toMatchObject({ section: "PRICING", elementType: "HEADLINE" });
  });

  it("classifies content on a customer-stories page as TESTIMONIALS", () => {
    const elements = [
      heading("h1", "Customer Stories", 0),
      paragraph("p1", "How Acme Corp doubled conversions using our platform", 1),
    ];
    const result = classifyPageElements("https://acme.com/customer-stories", elements);
    expect(result[1]).toMatchObject({ section: "TESTIMONIALS", elementType: "BODY" });
  });

  it("classifies a logo-looking image distinctly from a regular image", () => {
    const elements: RawElement[] = [
      { id: "img1", kind: "image", tag: "img", src: "/company-logo.svg", selector: "#img1", order: 0 },
      { id: "img2", kind: "image", tag: "img", src: "/hero-photo.jpg", selector: "#img2", order: 1 },
    ];
    const result = classifyPageElements("https://acme.com/", elements);
    expect(result[0]).toMatchObject({ elementType: "LOGO" });
    expect(result[1]).toMatchObject({ elementType: "IMAGE" });
  });

  it("never throws on an empty element list", () => {
    expect(() => classifyPageElements("https://acme.com/", [])).not.toThrow();
    expect(classifyPageElements("https://acme.com/", [])).toEqual([]);
  });

  it("classifies a linked CTA as both CTA_LABEL and CTA_HREF, sharing one selector", () => {
    const elements: RawElement[] = [
      { id: "c1", kind: "cta", tag: "a", text: "Book a demo", href: "/demo", selector: "#c1", order: 0 },
    ];
    const result = classifyPageElements("https://acme.com/", elements);
    const label = result.find((r) => r.elementType === "CTA_LABEL");
    const href = result.find((r) => r.elementType === "CTA_HREF");
    expect(label).toBeTruthy();
    expect(href).toBeTruthy();
    expect(href!.raw.selector).toBe(label!.raw.selector);
  });

  it("classifies a button with no href as CTA_LABEL only — nothing to personalize as a destination", () => {
    const elements: RawElement[] = [
      { id: "c1", kind: "cta", tag: "button", text: "Submit", selector: "#c1", order: 0 },
    ];
    const result = classifyPageElements("https://acme.com/", elements);
    expect(result).toHaveLength(1);
    expect(result[0].elementType).toBe("CTA_LABEL");
  });
});

describe("deriveElementContent", () => {
  it("uses the href for CTA_HREF, not the label text", () => {
    const raw: RawElement = { id: "c1", kind: "cta", tag: "a", text: "Book a demo", href: "/demo", selector: "#c1", order: 0 };
    expect(deriveElementContent(raw, "CTA_HREF")).toBe("/demo");
    expect(deriveElementContent(raw, "CTA_LABEL")).toBe("Book a demo");
  });

  it("uses the src for IMAGE and LOGO", () => {
    const raw: RawElement = { id: "i1", kind: "image", tag: "img", src: "/logo.svg", alt: "Acme", selector: "#i1", order: 0 };
    expect(deriveElementContent(raw, "IMAGE")).toBe("/logo.svg");
    expect(deriveElementContent(raw, "LOGO")).toBe("/logo.svg");
  });

  it("falls back to text for headline-type elements", () => {
    const raw: RawElement = { id: "h1", kind: "heading", tag: "h1", text: "Welcome", selector: "#h1", order: 0 };
    expect(deriveElementContent(raw, "HEADLINE")).toBe("Welcome");
  });
});

describe("buildHeuristicUnderstanding", () => {
  it("derives companySummary from the homepage title and marks judgment fields as needing AI", () => {
    const homepage: CrawledPageResult = {
      url: "https://acme.com/",
      title: "Acme — Project Management Software",
      elements: [],
    };
    const classifiedByPageId = new Map([[homepage.url, []]]);

    const result = buildHeuristicUnderstanding([homepage], classifiedByPageId);
    expect(result.companySummary).toContain("Acme — Project Management Software");
    expect(result.targetCustomers).toMatch(/Needs AI/);
    expect(result.brandTone.formality).toMatch(/Needs AI/);
  });

  it("pulls real value props from FEATURES headings and never invents them", () => {
    const homepage: CrawledPageResult = {
      url: "https://acme.com/",
      title: "Acme",
      elements: [],
    };
    const classifiedByPageId = new Map([
      [
        homepage.url,
        [
          { raw: heading("h3", "Real-time collaboration", 2), section: "FEATURES" as const, elementType: "HEADLINE" as const },
          { raw: heading("h4", "Automated reporting", 3), section: "FEATURES" as const, elementType: "HEADLINE" as const },
        ],
      ],
    ]);

    const result = buildHeuristicUnderstanding([homepage], classifiedByPageId);
    expect(result.valueProps).toEqual(["Real-time collaboration", "Automated reporting"]);
  });

  it("picks the most frequently repeated real CTA text as the primary CTA", () => {
    const homepage: CrawledPageResult = { url: "https://acme.com/", title: "Acme", elements: [] };
    const otherPage: CrawledPageResult = { url: "https://acme.com/pricing", title: "Pricing", elements: [] };
    const classifiedByPageId = new Map([
      [homepage.url, [{ raw: cta("c1", "Start Free Trial", 0), section: "HERO" as const, elementType: "CTA_LABEL" as const }]],
      [
        otherPage.url,
        [
          { raw: cta("c2", "Start Free Trial", 0), section: "CTA" as const, elementType: "CTA_LABEL" as const },
          { raw: cta("c3", "Contact Sales", 1), section: "CTA" as const, elementType: "CTA_LABEL" as const },
        ],
      ],
    ]);

    const result = buildHeuristicUnderstanding([homepage, otherPage], classifiedByPageId);
    expect(result.primaryCta).toBe("Start Free Trial");
  });

  it("excludes bare product/section names from value props (must be more than one word)", () => {
    const homepage: CrawledPageResult = { url: "https://acme.com/", title: "Acme", elements: [] };
    const classifiedByPageId = new Map([
      [
        homepage.url,
        [
          { raw: heading("h3", "Real-time collaboration", 2), section: "FEATURES" as const, elementType: "HEADLINE" as const },
          { raw: heading("h4", "AcmeCreative", 3), section: "FEATURES" as const, elementType: "HEADLINE" as const },
        ],
      ],
    ]);

    const result = buildHeuristicUnderstanding([homepage], classifiedByPageId);
    expect(result.valueProps).toEqual(["Real-time collaboration"]);
  });

  it("never picks a universal nav/utility phrase as the primary CTA, even if it's the most repeated", () => {
    const homepage: CrawledPageResult = { url: "https://acme.com/", title: "Acme", elements: [] };
    const otherPage: CrawledPageResult = { url: "https://acme.com/pricing", title: "Pricing", elements: [] };
    const classifiedByPageId = new Map([
      [
        homepage.url,
        [
          { raw: cta("c1", "Log in", 0), section: "CTA" as const, elementType: "CTA_LABEL" as const },
          { raw: cta("c2", "Book a demo", 1), section: "HERO" as const, elementType: "CTA_LABEL" as const },
        ],
      ],
      [
        otherPage.url,
        [{ raw: cta("c3", "Log in", 0), section: "CTA" as const, elementType: "CTA_LABEL" as const }],
      ],
    ]);

    const result = buildHeuristicUnderstanding([homepage, otherPage], classifiedByPageId);
    expect(result.primaryCta).toBe("Book a demo");
  });

  it("never throws when there are no pages at all", () => {
    expect(() => buildHeuristicUnderstanding([], new Map())).not.toThrow();
    const result = buildHeuristicUnderstanding([], new Map());
    expect(result.primaryCta).toBeNull();
    expect(result.valueProps).toEqual([]);
  });
});
