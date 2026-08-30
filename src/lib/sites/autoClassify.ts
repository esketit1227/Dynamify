import type { ContentSection, ContentElementType } from "@/generated/prisma/client";
import type { RawElement } from "@/lib/sites/extract";
import type { CrawledPageResult } from "@/lib/sites/crawler";

export type ClassifiedElement = {
  raw: RawElement;
  section: ContentSection;
  elementType: ContentElementType;
};

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim());
}

// The raw→content mapping must be elementType-aware once one raw CTA can
// produce two classified elements sharing the same raw object (label +
// destination, see classifyPageElements) — a plain text-first fallback
// chain would give the CTA_HREF row the button's label instead of its URL.
export function deriveElementContent(raw: RawElement, elementType: ContentElementType): string {
  if (elementType === "CTA_HREF") return raw.href ?? "";
  if (elementType === "IMAGE" || elementType === "LOGO") return raw.src ?? raw.alt ?? "";
  return raw.text ?? raw.href ?? raw.src ?? raw.alt ?? "";
}

// The rule-based stand-in for AI classification, used automatically when
// ANTHROPIC_API_KEY isn't configured (see sites/service.ts) — not an
// imitation of the model, a real second mode with its own honest limits.
// Originally written once for scripts/seed-elevenlabs.ts; promoted here so
// every site connection gets it, not just the seeded demo.
export function classifyPageElements(url: string, elements: RawElement[]): ClassifiedElement[] {
  const headings = elements.filter((e) => e.kind === "heading");
  const isPricing = url.includes("/pricing");
  const isStories = url.includes("/customer-stories") || url.includes("/testimonials");
  const isContact = url.includes("/contact");
  const firstHeadingId = headings[0]?.id;
  const secondHeadingId = headings[1]?.id;

  return elements
    .flatMap((raw, index): ClassifiedElement[] => {
      if (raw.kind === "heading") {
        if (raw.id === firstHeadingId) return [{ raw, section: "HERO", elementType: "HEADLINE" }];
        if (raw.id === secondHeadingId) return [{ raw, section: "HERO", elementType: "SUBHEADLINE" }];
        if (isPricing) return [{ raw, section: "PRICING", elementType: "HEADLINE" }];
        if (isStories) return [{ raw, section: "TESTIMONIALS", elementType: "HEADLINE" }];
        if (raw.text && isQuestion(raw.text)) return [{ raw, section: "FAQ", elementType: "HEADLINE" }];
        return [{ raw, section: "FEATURES", elementType: "HEADLINE" }];
      }
      if (raw.kind === "paragraph") {
        if (isStories) return [{ raw, section: "TESTIMONIALS", elementType: "BODY" }];
        return [{ raw, section: index < 8 ? "HERO" : "FEATURES", elementType: "BODY" }];
      }
      if (raw.kind === "cta") {
        const section = isContact ? "CTA" : index < 6 ? "HERO" : "CTA";
        const results: ClassifiedElement[] = [{ raw, section, elementType: "CTA_LABEL" }];
        // Only a real <a href>, not a <button>, has a destination to
        // personalize — see extract.ts (href is only ever set for "a" tags).
        if (raw.href) results.push({ raw, section, elementType: "CTA_HREF" });
        return results;
      }
      if (raw.kind === "image") {
        const looksLikeLogo = (raw.alt ?? raw.src ?? "").toLowerCase().includes("logo");
        return [
          {
            raw,
            section: looksLikeLogo ? "TESTIMONIALS" : "FEATURES",
            elementType: looksLikeLogo ? "LOGO" : "IMAGE",
          },
        ];
      }
      return [];
    })
    .slice(0, 40); // keep each page's inventory a sane size, same as the seed script
}

export type HeuristicUnderstanding = {
  companySummary: string;
  productSummary: string;
  targetCustomers: string;
  brandTone: { tone: string[]; vocabulary: string[]; formality: string };
  valueProps: string[];
  primaryCta: string | null;
};

const NEEDS_AI = "Needs AI — connect an ANTHROPIC_API_KEY to get this.";

// Every field here is traceable to something the crawl actually found — no
// field is a guess dressed up as an insight. Fields that would require real
// judgment (who this is for, how it sounds) say so plainly instead.
export function buildHeuristicUnderstanding(
  pages: CrawledPageResult[],
  classifiedByPageId: Map<string, ClassifiedElement[]>,
): HeuristicUnderstanding {
  const homepage = pages[0];
  const homepageClassified = homepage ? (classifiedByPageId.get(homepage.url) ?? []) : [];

  const companySummary = homepage?.title
    ? `From the homepage title: "${homepage.title}"`
    : "No page title found to summarize from.";

  const firstBody = homepageClassified.find((c) => c.elementType === "BODY")?.raw.text;
  const productSummary = firstBody
    ? `From the homepage's own copy: "${firstBody}"`
    : companySummary;

  // A bare product/section name ("ElevenCreative") is a heading, but not a
  // value proposition — require more than one word, closer to a real
  // sentence than a label.
  const valueProps = [...classifiedByPageId.values()]
    .flat()
    .filter(
      (c) =>
        c.section === "FEATURES" &&
        c.elementType === "HEADLINE" &&
        c.raw.text &&
        c.raw.text.trim().includes(" "),
    )
    .map((c) => c.raw.text!)
    .slice(0, 6);

  // Universal auth/utility chrome — never a marketing "primary CTA" on any
  // site, regardless of how often it repeats (unlike nav category labels,
  // which are too site-specific to denylist generically, this is the same
  // small set of phrases everywhere).
  const NAV_UTILITY_CTA_PHRASES = new Set([
    "log in",
    "log out",
    "sign in",
    "sign out",
    "register",
    "create account",
    "menu",
    "search",
  ]);
  const ctaCounts = new Map<string, number>();
  for (const classified of classifiedByPageId.values()) {
    for (const c of classified) {
      if (c.elementType !== "CTA_LABEL" || !c.raw.text) continue;
      if (NAV_UTILITY_CTA_PHRASES.has(c.raw.text.trim().toLowerCase())) continue;
      ctaCounts.set(c.raw.text, (ctaCounts.get(c.raw.text) ?? 0) + 1);
    }
  }
  const primaryCta =
    [...ctaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    companySummary,
    productSummary,
    targetCustomers: NEEDS_AI,
    brandTone: { tone: [], vocabulary: [], formality: NEEDS_AI },
    valueProps,
    primaryCta,
  };
}
