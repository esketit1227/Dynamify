import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, RateLimitedError } from "@/lib/auth/errors";
import { rateLimit } from "@/lib/auth/rateLimit";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { AiNotConfiguredError, AiGenerationError, BrandSafetyViolationError } from "@/lib/ai/errors";
import { safeContentString, DANGEROUS_URL_SCHEME } from "@/lib/validation/pages";
import { buildContentCorpus, checkClaimsAgainstCorpus } from "@/lib/sites/suggestVariant";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { searchWeb, MarketResearchNotConfiguredError, MarketResearchError, type SearchResult } from "@/lib/search/tavily";
import type { Prisma, ContentSection, ContentElementType, VariantMethod } from "@/generated/prisma/client";

// --- Closed vocabulary (deliberately small for v1) ------------------------

// PRICING/FAQ are deliberately excluded: a designed pricing table means
// writing a price, which docs/product-spec.md §13 bans outright as
// fabrication; FAQ needs a question/answer pair shape this schema doesn't
// carry yet. Both are additive later, not a blocker now.
export const DESIGNABLE_SECTIONS = ["HERO", "FEATURES", "TESTIMONIALS", "CTA"] as const;
export type DesignableSection = (typeof DESIGNABLE_SECTIONS)[number];

export const PAGE_DESIGN_LAYOUTS = [
  "HERO_CENTERED",
  "HERO_SPLIT",
  "FEATURES_GRID",
  "FEATURES_ALTERNATING",
  "TESTIMONIALS_QUOTE",
  "TESTIMONIALS_GRID",
  "CTA_BANNER",
  "CTA_INLINE",
] as const;
export type PageDesignLayout = (typeof PAGE_DESIGN_LAYOUTS)[number];

// A layout is only ever legal for its own section — enforced in the schema
// below, not left to the prompt alone.
export const LAYOUTS_BY_SECTION: Record<DesignableSection, readonly PageDesignLayout[]> = {
  HERO: ["HERO_CENTERED", "HERO_SPLIT"],
  FEATURES: ["FEATURES_GRID", "FEATURES_ALTERNATING"],
  TESTIMONIALS: ["TESTIMONIALS_QUOTE", "TESTIMONIALS_GRID"],
  CTA: ["CTA_BANNER", "CTA_INLINE"],
};

// --- Schema ----------------------------------------------------------------

// Shorter cap than safeContentString's 2000, same dangerous-scheme guard —
// for the shorter, single-line fields (headline/subheadline/ctaLabel/
// imageDescription) where a 2000-char value would never make sense anyway.
function shortSafeString(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !DANGEROUS_URL_SCHEME.test(value), "That value isn't allowed here");
}

export const pageDesignSectionSchema = z
  .object({
    section: z.enum(DESIGNABLE_SECTIONS),
    layout: z.enum(PAGE_DESIGN_LAYOUTS),
    headline: shortSafeString(140).optional(),
    subheadline: shortSafeString(240).optional(),
    body: safeContentString.optional(),
    ctaLabel: shortSafeString(60).optional(),
    // A described image *concept*, never a URL and never a generated asset —
    // rendered as an explicitly labeled placeholder, never as an <img>.
    imageDescription: shortSafeString(240).optional(),
    // FEATURES_* / list-style layouts. Plain strings, no invented metrics.
    items: z.array(shortSafeString(240)).max(6).optional(),
    // TESTIMONIALS only, and only ever real crawled quotes — see
    // enforceTestimonialAuthenticity / assertNoFabricatedTestimonials below.
    quotes: z.array(safeContentString).max(6).optional(),
  })
  .refine((s) => (LAYOUTS_BY_SECTION[s.section] as readonly string[]).includes(s.layout), {
    message: "That layout isn't valid for that section",
  })
  .refine((s) => Boolean(s.headline || s.body || s.ctaLabel || s.items?.length || s.quotes?.length), {
    message: "A section must carry some content",
  });

export const pageDesignSectionsSchema = z.array(pageDesignSectionSchema).min(2).max(8);
export type PageDesignSection = z.infer<typeof pageDesignSectionSchema>;

// Read boundary. Returns [] and logs rather than throwing: a single
// unreadable row must not break the whole /recommendations page (CLAUDE.md:
// a failure here should degrade honestly, not take everything else down).
// The UI renders an explicit "this design couldn't be read" state for an
// empty section list, never a silently blank card.
export function parseStoredSections(value: unknown): PageDesignSection[] {
  const parsed = pageDesignSectionsSchema.safeParse(value);
  if (!parsed.success) {
    console.error("PageDesign.sections failed validation on read:", parsed.error.issues);
    return [];
  }
  return parsed.data;
}

// A real citation the market-context summary was actually built from —
// {title, url}, not just prose asserting a source exists. Same http(s)-only
// scheme check as src/lib/search/tavily.ts's own result schema (defense in
// depth: this is the boundary the UI actually renders a real <a href> from).
export const marketSourceSchema = z.object({
  title: z.string().max(300),
  url: z
    .string()
    .max(2000)
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Only http/https URLs are allowed"),
});
export const marketSourcesSchema = z.array(marketSourceSchema).max(5);
export type MarketSource = z.infer<typeof marketSourceSchema>;

// Read boundary, same posture as parseStoredSections: never throws, a
// single unreadable row degrades to "no sources shown" rather than
// breaking the page.
export function parseStoredMarketSources(value: unknown): MarketSource[] {
  const parsed = marketSourcesSchema.safeParse(value);
  if (!parsed.success) {
    console.error("PageDesign.marketSources failed validation on read:", parsed.error.issues);
    return [];
  }
  return parsed.data;
}

// --- Errors and DTOs ---------------------------------------------------

export class PageDesignNotFoundError extends HttpError {
  constructor() {
    super(404, "Page design not found");
  }
}

// Mirrors NoEligibleElementsError's posture (generateExperience.ts): the
// input page is too thin, not a generation failure.
export class NoDesignableContentError extends HttpError {
  constructor() {
    super(400, "There isn't enough crawled content on this page to design a new page from.");
  }
}

export type PageDesignDTO = {
  id: string;
  crawledPageId: string;
  siteUrl: string;
  pageUrl: string;
  pageTitle: string | null;
  status: "PENDING" | "ENDORSED";
  method: "AI" | "HEURISTIC";
  marketContext: string;
  marketSources: MarketSource[];
  sections: PageDesignSection[];
  createdAt: string;
};

export type PageDesignCandidateDTO = {
  crawledPageId: string;
  siteId: string;
  siteUrl: string;
  pageUrl: string;
  pageTitle: string | null;
  // Most recent design for this page, if any — re-derived at read time.
  design: PageDesignDTO | null;
};

type PageDesignRow = {
  id: string;
  crawledPageId: string;
  status: "PENDING" | "ENDORSED";
  method: VariantMethod;
  marketContext: string;
  marketSources: Prisma.JsonValue;
  sections: Prisma.JsonValue;
  createdAt: Date;
};

type PageContext = { url: string; title: string | null; site: { url: string } };

function toPageDesignDTO(row: PageDesignRow, page: PageContext): PageDesignDTO {
  return {
    id: row.id,
    crawledPageId: row.crawledPageId,
    siteUrl: page.site.url,
    pageUrl: page.url,
    pageTitle: page.title,
    status: row.status,
    // MANUAL is never written for a PageDesign — see the model comment —
    // so only AI/HEURISTIC ever actually appear here.
    method: row.method as "AI" | "HEURISTIC",
    marketContext: row.marketContext,
    marketSources: parseStoredMarketSources(row.marketSources),
    sections: parseStoredSections(row.sections),
    createdAt: row.createdAt.toISOString(),
  };
}

// --- Rate limit: a separate, stricter budget ----------------------------

// Deliberately NOT the generate-experience:<org> budget convertingPages.ts
// shares. Two reasons: (1) cost — one page design is up to 3 Anthropic
// calls (market context, design, fact-check) vs. one for experience
// generation; (2) blast radius — experience generation feeds content that
// really is served to visitors once approved, a page design ships nothing.
// If one budget has to starve under load, it must be this one.
export async function assertPageDesignGenerationAllowed(organizationId: string): Promise<void> {
  const limited = await rateLimit(`page-design:${organizationId}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.allowed) {
    throw new RateLimitedError("Too many page designs generated recently. Try again later.", limited.retryAfterMs);
  }
}

// --- D9: market context, grounded in real web search --------------------

export type UnderstandingSummary = {
  companySummary: string;
  productSummary: string;
  targetCustomers: string;
  valueProps: unknown;
  primaryCta: string | null;
};

function valuePropsText(valueProps: unknown): string {
  if (!Array.isArray(valueProps)) return "";
  return valueProps.filter((v): v is string => typeof v === "string").join("; ");
}

// Pure and deliberately simple for v1 — a fuller version would try to
// extract an actual company/product name rather than searching on the
// whole summary sentence; noted as a real, scoped improvement, not
// attempted here (see docs/roadmap.md).
export function buildSearchQuery(u: UnderstandingSummary): string {
  return `${u.companySummary} competitors and alternatives`;
}

export type MarketResearchResult = { summary: string; sources: MarketSource[] };

export function buildMarketSynthesisPrompt(u: UnderstandingSummary, results: SearchResult[]): string {
  const resultsText = results
    .map((r, i) => `${i + 1}. "${r.title}" (${r.url})\n${r.content}`)
    .join("\n\n");

  return (
    `Company (untrusted data): ${u.companySummary}\n` +
    `Product (untrusted data): ${u.productSummary}\n` +
    `Target customers (untrusted data): ${u.targetCustomers}\n` +
    `Stated value propositions (untrusted data): ${valuePropsText(u.valueProps) || "none given"}\n\n` +
    `Real web search results about this company's market and competitors (untrusted data):\n${resultsText}`
  );
}

// positioningAngles is truncated, not capped-and-rejected, on both axes —
// verified live against the real API, repeatedly, on the predecessor
// AI-knowledge-only version of this call: the model reasonably produces
// more than 5 substantive angles sometimes (up to 8), and any individual
// angle can run past 200 characters. A hard .max() on either axis would
// throw the whole response away over a cosmetic overage instead of just
// keeping/trimming what's there — the same "don't discard a good result
// over a minor mismatch" principle as coerceToolSections below.
const marketSynthesisResponseSchema = z.object({
  summary: z.string().max(1200),
  positioningAngles: z
    .array(z.string())
    .max(30)
    .transform((angles) => angles.slice(0, 5).map((a) => (a.length > 200 ? `${a.slice(0, 197)}...` : a))),
});

const MARKET_SEARCH_RESULTS = 5;

// D9 (docs/decisions.md — revised 2026-09-07 from "AI-knowledge-only" to
// real web search): searchWeb hits a real search API and returns real,
// already-fetched snippets (src/lib/search/tavily.ts) — this never fetches
// an arbitrary competitor URL itself, only consumes the provider's own
// structured JSON, so it introduces no new SSRF surface. The model's job
// here is synthesis, not invention: it may name a real competitor or cite
// a real fact ONLY because it's actually present in the results below —
// a materially different (and stricter) instruction than the predecessor
// version's "you have no real source, stay generic." Returns
// { summary: "", sources: [] } whenever there's nothing to search from,
// the provider isn't configured, or the search/synthesis step fails —
// callers treat that as "no market research for this design," never a
// fabricated fallback.
export async function researchMarketContext(u: UnderstandingSummary | null): Promise<MarketResearchResult> {
  const empty: MarketResearchResult = { summary: "", sources: [] };
  if (!u) return empty;

  const results = await searchWeb(buildSearchQuery(u), MARKET_SEARCH_RESULTS);
  if (results.length === 0) return empty;

  const client = getAnthropicClient();
  const TOOL_NAME = "market_context";

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    system:
      "You summarize a company's competitive market positioning, using ONLY the real web search " +
      "results provided — you have genuinely been given real, current source material this time, " +
      "not asked to guess from general knowledge. You may name a specific competitor, cite a " +
      "statistic, or state a fact ONLY if it actually appears in the results given to you. Never " +
      "add a competitor, number, or claim the results don't contain. If the results are thin, " +
      "irrelevant, or don't clearly identify real competitors, say so plainly rather than filling " +
      "the gap with speculation. Call the market_context tool with your answer.",
    messages: [{ role: "user", content: buildMarketSynthesisPrompt(u, results) }],
    tools: [
      {
        name: TOOL_NAME,
        description: "Provide a market-positioning summary grounded in the given search results.",
        input_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            positioningAngles: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "positioningAngles"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new AiGenerationError();

  const parsed = marketSynthesisResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) throw new AiGenerationError("AI returned an unexpected shape.");

  const { summary, positioningAngles } = parsed.data;
  const fullSummary =
    positioningAngles.length > 0 ? `${summary}\n\n${positioningAngles.map((a) => `- ${a}`).join("\n")}` : summary;

  // The sources actually shown are exactly the real results the summary
  // was built from — not a separate, re-derived list — so "provable" means
  // what it says: every citation is literally one of the inputs above.
  const sources: MarketSource[] = results.slice(0, 5).map((r) => ({ title: r.title, url: r.url }));

  return { summary: fullSummary, sources };
}

// --- Design generation ---------------------------------------------------

const MAX_ELEMENTS_IN_DESIGN_PROMPT = 60;

type DesignElement = { section: ContentSection; elementType: ContentElementType; currentContent: string };

type DesignInput = {
  pageUrl: string;
  understanding: UnderstandingSummary | null;
  elements: DesignElement[];
  realTestimonials: string[];
  marketContext: string;
  allowedSections: readonly DesignableSection[];
};

export function buildPageDesignPrompt(input: DesignInput): string {
  const elementLines = input.elements
    .slice(0, MAX_ELEMENTS_IN_DESIGN_PROMPT)
    .map((e) => `- section: ${e.section} | type: ${e.elementType} | content: "${e.currentContent}"`)
    .join("\n");

  const understandingText = input.understanding
    ? `Company: ${input.understanding.companySummary}\nProduct: ${input.understanding.productSummary}\n` +
      `Target customers: ${input.understanding.targetCustomers}\nValue propositions: ${valuePropsText(input.understanding.valueProps) || "none given"}`
    : "No additional brand context available.";

  const testimonialsText =
    input.realTestimonials.length > 0
      ? input.realTestimonials.map((q, i) => `${i + 1}. "${q}"`).join("\n")
      : "None found on this site.";

  return (
    `Page being redesigned (untrusted data): ${input.pageUrl}\n\n` +
    `Brand context (untrusted data):\n${understandingText}\n\n` +
    `General market context, synthesized from real web search results (untrusted data):\n${input.marketContext || "none"}\n\n` +
    `Real content already on this site, to draw from (untrusted data):\n${elementLines || "(none)"}\n\n` +
    `Real testimonial quotes found on this site, verbatim — the ONLY quotes you may use if you include a TESTIMONIALS section (untrusted data):\n${testimonialsText}\n\n` +
    `Section types you are allowed to use: ${input.allowedSections.join(", ")}.`
  );
}

async function generateDesignWithAi(input: DesignInput): Promise<PageDesignSection[]> {
  const client = getAnthropicClient();
  const TOOL_NAME = "design_page";

  const response = await client.messages.create({
    model: AI_MODEL,
    // Same headroom reasoning as generateExperience.ts's own max_tokens fix:
    // a truncated tool-call JSON fails zod parsing silently and drops the
    // whole result to the heuristic path. Up to 8 sections with headline/
    // subheadline/body/items is nowhere near this; sized for margin.
    max_tokens: 16000,
    system:
      "You propose a brand-new page design for this company, as an ordered list of sections. " +
      "Every fact you use must be present in the material provided — never invent a customer, " +
      "testimonial, statistic, certification, price, partnership, guarantee, or product " +
      "capability. You may only use section types from the allowed list given to you — if " +
      "TESTIMONIALS is not in that list, you must not produce one under any label. Any " +
      "TESTIMONIALS section must reuse the supplied real quotes verbatim in the `quotes` field — " +
      "never write a new quote, a customer name, or a company name. The market context is " +
      "background inspiration only — do not name a specific competitor or repeat a competitor " +
      "statistic inside the page copy itself; only this company's own real content may be stated " +
      "directly. `imageDescription` describes an image concept in a few words; it is never a URL. " +
      "Call the design_page tool with the full ordered section list.",
    messages: [{ role: "user", content: buildPageDesignPrompt(input) }],
    tools: [
      {
        name: TOOL_NAME,
        description: "Provide the ordered list of page sections.",
        input_schema: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  section: { type: "string", enum: input.allowedSections as unknown as string[] },
                  layout: { type: "string", enum: PAGE_DESIGN_LAYOUTS as unknown as string[] },
                  headline: { type: "string" },
                  subheadline: { type: "string" },
                  body: { type: "string" },
                  ctaLabel: { type: "string" },
                  imageDescription: { type: "string" },
                  items: { type: "array", items: { type: "string" } },
                  quotes: { type: "array", items: { type: "string" } },
                },
                required: ["section", "layout"],
              },
            },
          },
          required: ["sections"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new AiGenerationError();

  const parsed = pageDesignSectionsSchema.safeParse(coerceToolSections((toolUse.input as { sections?: unknown })?.sections));
  if (!parsed.success) throw new AiGenerationError("AI returned an unexpected shape.");
  return parsed.data;
}

// Defensive, not theoretical: verified live against the real Anthropic API
// (this exact tool schema, this model) that the `sections` value comes back
// as a JSON string containing a *second*, self-referential `{ sections:
// [...] }` wrapper — not the literal array the schema asks for — 100% of
// the time in testing, not an occasional fluke. Rather than let every
// single AI attempt silently fail validation and fall back to heuristic
// (which is exactly what happened before this was caught), unwrap the
// observed shapes before validating. A well-formed literal array still
// passes straight through unchanged.
export function coerceToolSections(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { sections?: unknown }).sections)) {
      return (parsed as { sections: unknown[] }).sections;
    }
  } catch {
    // Not valid JSON either — fall through and let the zod array check
    // below produce the same "unexpected shape" rejection as before.
  }
  return raw;
}

// --- Brand safety, adapted for a whole-page artifact ----------------------

function normalizeQuote(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "") // smart/straight quotes the model loves to re-punctuate
    .replace(/\s+/g, " ")
    .trim();
}

// Sanitizer (best-effort cleanup) — docs/product-spec.md §13 bans
// fabricating a customer or testimonial outright. The model is instructed
// not to, and is never trusted to have obeyed. Nothing survives here that
// isn't literally a quote the crawl found on the customer's own site.
export function enforceTestimonialAuthenticity(
  sections: PageDesignSection[],
  realQuotes: string[],
): { sections: PageDesignSection[]; droppedSections: number; droppedQuotes: number } {
  const allowed = new Set(realQuotes.map(normalizeQuote));
  const out: PageDesignSection[] = [];
  let droppedSections = 0;
  let droppedQuotes = 0;

  for (const section of sections) {
    if (section.section !== "TESTIMONIALS") {
      // A quotes array anywhere else is meaningless — strip it so a
      // fabricated quote can't ride along on a non-testimonials section.
      if (section.quotes?.length) droppedQuotes += section.quotes.length;
      out.push(section.quotes ? { ...section, quotes: undefined } : section);
      continue;
    }

    const kept = (section.quotes ?? []).filter((q) => allowed.has(normalizeQuote(q)));
    droppedQuotes += (section.quotes?.length ?? 0) - kept.length;

    if (kept.length === 0) {
      // No real quote survives, so this section has nothing legitimate to
      // show — it doesn't exist, rather than existing with invented filler.
      droppedSections += 1;
      continue;
    }

    // Only these fields survive on a testimonials section. body/
    // subheadline/items are free-form model prose that could carry an
    // invented attribution ("— Sarah, VP at Northwind") and have no
    // legitimate use here.
    out.push({
      section: section.section,
      layout: kept.length >= 3 ? "TESTIMONIALS_GRID" : "TESTIMONIALS_QUOTE",
      headline: section.headline,
      quotes: kept,
    });
  }

  return { sections: out, droppedSections, droppedQuotes };
}

// The non-bypassable half. Called from the single prisma.pageDesign.create
// call site (persistDesign, below) regardless of which path produced the
// sections — same "one choke point" shape as getLiveViewDefinition being
// the single read every resolver goes through.
function assertNoFabricatedTestimonials(sections: PageDesignSection[], realQuotes: string[]): void {
  const allowed = new Set(realQuotes.map(normalizeQuote));
  for (const s of sections) {
    if (s.section !== "TESTIMONIALS") {
      if (s.quotes?.length) {
        throw new BrandSafetyViolationError("A quote appeared outside a testimonials section.");
      }
      continue;
    }
    if (!s.quotes || s.quotes.length === 0) {
      throw new BrandSafetyViolationError("A testimonials section with no real quote reached persistence.");
    }
    for (const quote of s.quotes) {
      if (!allowed.has(normalizeQuote(quote))) {
        throw new BrandSafetyViolationError("A testimonial that isn't in this site's own crawl reached persistence.");
      }
    }
  }
}

// Every text field a reviewer will actually read, in one place, so nothing
// escapes the corpus check by living in a field someone forgot to include.
// quotes are deliberately excluded — they're already-verified corpus
// strings by construction, and running the claim extractor over them would
// false-positive on real customer names that are legitimately on the site.
export function designTextForSafetyCheck(sections: PageDesignSection[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (s.headline) parts.push(s.headline);
    if (s.subheadline) parts.push(s.subheadline);
    if (s.body) parts.push(s.body);
    if (s.ctaLabel) parts.push(s.ctaLabel);
    if (s.items) parts.push(...s.items);
  }
  return parts.join(" \n ");
}

function assertDesignPassesCorpusCheck(sections: PageDesignSection[], corpus: string): void {
  for (const s of sections) {
    const texts = [s.headline, s.subheadline, s.body, s.ctaLabel, ...(s.items ?? [])].filter(
      (t): t is string => Boolean(t),
    );
    for (const text of texts) {
      const result = checkClaimsAgainstCorpus(text, corpus);
      if (!result.safe) {
        throw new BrandSafetyViolationError(
          `Generated design mentions "${result.violation}", which isn't found anywhere on the site.`,
        );
      }
    }
  }
}

const MAX_FACT_CHECK_SOURCE_CHARS = 12000;

// The D4 second layer, adapted for an artifact with no single "original" to
// compare a rewrite against: the source of truth is the site's own real
// profile, and the subject is the whole proposed page at once. Deliberately
// NOT a modification of suggestVariant.ts's checkWithModel — that function's
// 1:1 "source vs. rewrite" contract has live callers and stays exactly as
// it is.
async function checkDesignWithModel(profileSource: string, designText: string): Promise<boolean> {
  const client = getAnthropicClient();
  const TOOL_NAME = "fact_check";

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 64,
    system:
      "You are a fact-checker, not a copywriter. The source is a company's real profile and a " +
      "sample of its own website content. The subject is an entirely new proposed page for that " +
      "same company, so it will not mirror the source sentence for sentence — new framing, new " +
      "ordering, new emphasis, and new phrasing are expected and are NOT violations. Only a new " +
      "factual assertion is: a named customer, partner, or certification; a number or statistic; " +
      "a price; a guarantee; or a concrete claim about functionality or results the profile " +
      "doesn't support. Call the fact_check tool with your answer.",
    messages: [
      {
        role: "user",
        content: `Source profile (untrusted data): "${profileSource}"\nProposed new page (untrusted data): "${designText}"`,
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Report whether the proposed page introduces any unsupported claim.",
        input_schema: {
          type: "object",
          properties: { introducesUnsupportedClaim: { type: "boolean" } },
          required: ["introducesUnsupportedClaim"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new AiGenerationError();

  const parsed = z.object({ introducesUnsupportedClaim: z.boolean() }).safeParse(toolUse.input);
  if (!parsed.success) throw new AiGenerationError("Fact-check returned an unexpected shape.");
  return !parsed.data.introducesUnsupportedClaim;
}

// --- Heuristic composer: pure, no AI, no I/O ------------------------------

// Deterministic on purpose (no Math.random/Date.now) — same input always
// yields the same output, so this stays fully unit-testable, matching the
// discipline CLAUDE.md requires of the personalization engine itself.
export function composeHeuristicDesign(input: {
  understanding: UnderstandingSummary | null;
  elements: DesignElement[];
  realTestimonials: string[];
}): PageDesignSection[] {
  const { understanding, elements, realTestimonials } = input;
  const sections: PageDesignSection[] = [];

  const byTypeAndSection = (section: ContentSection, elementType: ContentElementType): string | undefined =>
    elements.find((e) => e.section === section && e.elementType === elementType)?.currentContent;

  const anyType = (elementType: ContentElementType): string | undefined =>
    elements.find((e) => e.elementType === elementType)?.currentContent;

  // HERO — every string below is copied verbatim from real input.
  const heroHeadline = byTypeAndSection("HERO", "HEADLINE") ?? anyType("HEADLINE");
  const heroSubheadline = byTypeAndSection("HERO", "SUBHEADLINE") ?? valuePropsFirst(understanding?.valueProps);
  const heroCta = anyType("CTA_LABEL") ?? understanding?.primaryCta ?? undefined;
  if (heroHeadline || heroSubheadline) {
    sections.push({
      section: "HERO",
      layout: "HERO_CENTERED",
      headline: heroHeadline,
      subheadline: heroSubheadline,
      ctaLabel: heroCta,
    });
  }

  // FEATURES — value props first (already a curated real list), else real
  // FEATURES-section content, deduped. Only emitted with >=2 real items.
  const valueItems = valuePropsList(understanding?.valueProps);
  const featureElementItems = elements
    .filter((e) => e.section === "FEATURES" && (e.elementType === "HEADLINE" || e.elementType === "BODY"))
    .map((e) => e.currentContent);
  const items = dedupe([...valueItems, ...featureElementItems]).slice(0, 3);
  if (items.length >= 2) {
    const avgLength = items.reduce((sum, i) => sum + i.length, 0) / items.length;
    sections.push({
      section: "FEATURES",
      layout: avgLength > 120 ? "FEATURES_ALTERNATING" : "FEATURES_GRID",
      headline: byTypeAndSection("FEATURES", "HEADLINE"),
      items,
    });
  }

  // TESTIMONIALS — only when real quotes exist. Never invented.
  if (realTestimonials.length > 0) {
    const quotes = realTestimonials.slice(0, 3);
    sections.push({
      section: "TESTIMONIALS",
      layout: quotes.length >= 3 ? "TESTIMONIALS_GRID" : "TESTIMONIALS_QUOTE",
      headline: byTypeAndSection("TESTIMONIALS", "HEADLINE"),
      quotes,
    });
  }

  // CTA — the site's own real CTA label / primaryCta, restated as a banner.
  const ctaLabel = [...elements].reverse().find((e) => e.elementType === "CTA_LABEL")?.currentContent ?? understanding?.primaryCta ?? undefined;
  if (ctaLabel) {
    sections.push({
      section: "CTA",
      layout: "CTA_BANNER",
      headline: firstSentence(understanding?.productSummary),
      ctaLabel,
    });
  }

  return sections;
}

function valuePropsList(valueProps: unknown): string[] {
  if (!Array.isArray(valueProps)) return [];
  return valueProps.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function valuePropsFirst(valueProps: unknown): string | undefined {
  return valuePropsList(valueProps)[0];
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((i) => i.trim()).filter(Boolean))];
}

function firstSentence(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(/^[^.!?]*[.!?]?/);
  const sentence = match?.[0]?.trim();
  return sentence && sentence.length > 0 ? sentence : undefined;
}

// --- Sourcing real testimonial quotes --------------------------------------

const MIN_TESTIMONIAL_LENGTH = 40;

// Filtered, not taken wholesale: autoClassify.ts also classifies logo
// images as section: TESTIMONIALS, elementType: LOGO (content = an image
// URL) and section headings like "Customer stories" as TESTIMONIALS/
// HEADLINE — neither is a real quote. Site-wide, not page-scoped, since
// testimonials often live on a separate page from the one being redesigned.
async function findRealTestimonialQuotes(siteId: string, organizationId: string): Promise<string[]> {
  const rows = await prisma.contentElement.findMany({
    where: {
      organizationId,
      crawledPage: { siteId },
      section: "TESTIMONIALS",
      elementType: { in: ["BODY", "SUBHEADLINE"] },
    },
    select: { currentContent: true },
    take: 24,
  });

  return dedupe(
    rows
      .map((r) => r.currentContent.trim())
      .filter((t) => t.length >= MIN_TESTIMONIAL_LENGTH && !/^https?:\/\//i.test(t)),
  ).slice(0, 12);
}

// --- Orchestration ---------------------------------------------------------

function allowedSectionsFor(realTestimonials: string[]): DesignableSection[] {
  return realTestimonials.length > 0
    ? [...DESIGNABLE_SECTIONS]
    : DESIGNABLE_SECTIONS.filter((s) => s !== "TESTIMONIALS");
}

async function persistDesign(args: {
  organizationId: string;
  crawledPageId: string;
  method: "AI" | "HEURISTIC";
  marketContext: string;
  marketSources: MarketSource[];
  sections: PageDesignSection[];
  realTestimonials: string[];
  page: PageContext;
}): Promise<PageDesignDTO> {
  assertNoFabricatedTestimonials(args.sections, args.realTestimonials);
  const validated = pageDesignSectionsSchema.parse(args.sections);
  const validatedSources = marketSourcesSchema.parse(args.marketSources);

  const row = await prisma.pageDesign.create({
    data: {
      organizationId: args.organizationId,
      crawledPageId: args.crawledPageId,
      status: "PENDING",
      method: args.method,
      marketContext: args.marketContext,
      marketSources: validatedSources as unknown as Prisma.InputJsonValue,
      sections: validated as unknown as Prisma.InputJsonValue,
    },
  });

  return toPageDesignDTO(row as unknown as PageDesignRow, args.page);
}

export async function generateNewPageDesign(organizationId: string, crawledPageId: string): Promise<PageDesignDTO> {
  const page = await prisma.crawledPage.findFirst({
    where: { id: crawledPageId, organizationId },
    select: { id: true, siteId: true, url: true, title: true, site: { select: { url: true } } },
  });
  if (!page) throw new CrawledPageNotFoundError();

  await assertPageDesignGenerationAllowed(organizationId);

  const [elements, realTestimonials, understandingRow] = await Promise.all([
    prisma.contentElement.findMany({
      where: { crawledPageId, organizationId },
      select: { section: true, elementType: true, currentContent: true },
      orderBy: { order: "asc" },
      take: MAX_ELEMENTS_IN_DESIGN_PROMPT,
    }),
    findRealTestimonialQuotes(page.siteId, organizationId),
    prisma.websiteUnderstanding.findUnique({
      where: { siteId: page.siteId },
      select: { companySummary: true, productSummary: true, targetCustomers: true, valueProps: true, primaryCta: true },
    }),
  ]);

  if (elements.length === 0) throw new NoDesignableContentError();

  const understanding: UnderstandingSummary | null = understandingRow;
  const allowedSections = allowedSectionsFor(realTestimonials);

  // Market research and page-copy generation are independent concerns now
  // that research is real, sourced, and verifiable — not two halves of one
  // "AI path" the way AI-knowledge-only speculation was. A real citation
  // that was actually found is worth keeping even if the design generation
  // below falls back to heuristic, and vice versa; each has its own
  // try/catch rather than one shared block that discards both on either
  // failure.
  let marketContext = "";
  let marketSources: MarketSource[] = [];
  try {
    const research = await researchMarketContext(understanding);
    marketContext = research.summary;
    marketSources = research.sources;
  } catch (error) {
    if (
      !(error instanceof MarketResearchNotConfiguredError) &&
      !(error instanceof MarketResearchError) &&
      !(error instanceof AiNotConfiguredError) &&
      !(error instanceof AiGenerationError)
    ) {
      throw error;
    }
    console.warn("Market research unavailable for this design:", error.message);
  }

  let sections: PageDesignSection[] | null = null;
  let method: "AI" | "HEURISTIC" = "HEURISTIC";

  try {
    const proposed = await generateDesignWithAi({
      pageUrl: page.url,
      understanding,
      elements,
      realTestimonials,
      marketContext,
      allowedSections,
    });

    const { sections: sanitized } = enforceTestimonialAuthenticity(proposed, realTestimonials);
    if (sanitized.length < 2) {
      throw new BrandSafetyViolationError("Too little of the design survived validation.");
    }

    const corpus = await buildContentCorpus(page.siteId, organizationId);
    assertDesignPassesCorpusCheck(sanitized, corpus);

    const profileSource =
      (understanding
        ? `${understanding.companySummary} ${understanding.productSummary} ${understanding.targetCustomers} ${valuePropsText(understanding.valueProps)}`
        : "") + " " + corpus.slice(0, MAX_FACT_CHECK_SOURCE_CHARS);
    const passed = await checkDesignWithModel(profileSource, designTextForSafetyCheck(sanitized));
    if (!passed) {
      throw new BrandSafetyViolationError("Generated design was flagged as introducing an unsupported claim.");
    }

    sections = sanitized;
    method = "AI";
  } catch (error) {
    if (
      !(error instanceof AiNotConfiguredError) &&
      !(error instanceof AiGenerationError) &&
      !(error instanceof BrandSafetyViolationError)
    ) {
      throw error;
    }
    // Logged, never swallowed silently — a bare catch {} here would hide
    // exactly why a design fell back, the same class of gap fixed elsewhere
    // in this codebase (docs/roadmap.md, 2026-09-07 understandSite entry).
    console.warn("Page design fell back to the heuristic composer:", error.message);
    sections = null;
  }

  if (!sections) {
    sections = composeHeuristicDesign({ understanding, elements, realTestimonials });
  }
  if (sections.length < 2) throw new NoDesignableContentError();

  return persistDesign({
    organizationId,
    crawledPageId,
    method,
    marketContext,
    marketSources,
    sections,
    realTestimonials,
    page: { url: page.url, title: page.title, site: page.site },
  });
}

// --- Read / review ---------------------------------------------------------

const PAGE_SELECT = { id: true, url: true, title: true, siteId: true, site: { select: { url: true } } } as const;

export async function listPageDesignCandidates(organizationId: string): Promise<PageDesignCandidateDTO[]> {
  const pages = await prisma.crawledPage.findMany({
    where: { organizationId },
    select: PAGE_SELECT,
    orderBy: { crawledAt: "desc" },
  });
  if (pages.length === 0) return [];

  const designs = await prisma.pageDesign.findMany({
    where: { organizationId, crawledPageId: { in: pages.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
  });

  const latestByPage = new Map<string, (typeof designs)[number]>();
  for (const design of designs) {
    if (!latestByPage.has(design.crawledPageId)) latestByPage.set(design.crawledPageId, design);
  }

  return pages.map((page) => {
    const design = latestByPage.get(page.id);
    return {
      crawledPageId: page.id,
      siteId: page.siteId,
      siteUrl: page.site.url,
      pageUrl: page.url,
      pageTitle: page.title,
      design: design ? toPageDesignDTO(design as unknown as PageDesignRow, { url: page.url, title: page.title, site: page.site }) : null,
    };
  });
}

async function requirePageDesign(organizationId: string, pageDesignId: string) {
  const design = await prisma.pageDesign.findFirst({
    where: { id: pageDesignId, organizationId },
    include: { crawledPage: { select: { url: true, title: true, site: { select: { url: true } } } } },
  });
  if (!design) throw new PageDesignNotFoundError();
  return design;
}

export async function getPageDesign(organizationId: string, pageDesignId: string): Promise<PageDesignDTO> {
  const design = await requirePageDesign(organizationId, pageDesignId);
  return toPageDesignDTO(design as unknown as PageDesignRow, design.crawledPage);
}

// Touches ONLY PageDesign.status. No Audience, ElementPersonalizationRule,
// ElementVariant, or GeneratedExperience row is created, read, or modified
// here — see docs/decisions.md D8. Endorsing records that the customer
// likes this direction; it is not, and cannot become, "live."
export async function endorsePageDesign(organizationId: string, pageDesignId: string): Promise<PageDesignDTO> {
  const design = await requirePageDesign(organizationId, pageDesignId);
  const updated = await prisma.pageDesign.update({ where: { id: design.id }, data: { status: "ENDORSED" } });
  return toPageDesignDTO(updated as unknown as PageDesignRow, design.crawledPage);
}

export async function rejectPageDesign(organizationId: string, pageDesignId: string): Promise<void> {
  const design = await requirePageDesign(organizationId, pageDesignId);
  await prisma.pageDesign.delete({ where: { id: design.id } });
}
