import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { AiNotConfiguredError, AiGenerationError, BrandSafetyViolationError } from "@/lib/ai/errors";
import { safeContentString } from "@/lib/validation/pages";
import type { VisitorContext } from "@dynamify/personalization-sdk";

export class ContentElementNotFoundError extends HttpError {
  constructor() {
    super(404, "Content element not found");
  }
}

export type SuggestedVariant = { content: string; method: "AI" | "HEURISTIC" };

function describeProfile(profile: VisitorContext): string {
  const parts: string[] = [];
  if (profile.device) parts.push(`device: ${profile.device}`);
  if (profile.geo?.country) parts.push(`country: ${profile.geo.country}`);
  if (profile.geo?.region) parts.push(`region: ${profile.geo.region}`);
  if (profile.geo?.city) parts.push(`city: ${profile.geo.city}`);
  if (profile.referrer) parts.push(`referrer: ${profile.referrer}`);
  if (profile.utm?.source) parts.push(`traffic source: ${profile.utm.source}`);
  if (profile.utm?.medium) parts.push(`traffic medium: ${profile.utm.medium}`);
  if (profile.utm?.campaign) parts.push(`campaign: ${profile.utm.campaign}`);
  if (profile.utm?.term) parts.push(`search term: ${profile.utm.term}`);
  if (profile.utm?.content) parts.push(`ad content: ${profile.utm.content}`);
  if (profile.returning) parts.push("returning visitor");
  if (profile.sessionCount !== undefined) parts.push(`session count: ${profile.sessionCount}`);
  for (const [key, value] of Object.entries(profile.attributes ?? {})) {
    parts.push(`${key}: ${value}`);
  }
  return parts.length > 0 ? parts.join(", ") : "a general visitor";
}

// --- D4 (docs/decisions.md): brand-safety validation, two layers -----

// Pure and unit-testable on its own — no network, no DB. Flags numbers and
// mid-sentence capitalized word runs (much more likely to be a genuine
// proper noun — a company, product, or certification — than ordinary
// sentence-initial capitalization) that don't appear anywhere in the
// site's own real content. A false positive just means falling back to
// the heuristic path, which is always safe — so this errs conservative.
export function extractClaims(text: string): string[] {
  const claims: string[] = [];

  // No trailing \b: a literal "%" is a non-word char, so a boundary right
  // after it never matches and the regex would silently drop the "%".
  const numbers = text.match(/\b\d+(?:\.\d+)?%?/g);
  if (numbers) claims.push(...numbers);

  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    let i = 1; // skip index 0 — sentence-initial, always capitalized regardless
    while (i < words.length) {
      if (/^[A-Z][a-zA-Z]*$/.test(words[i])) {
        let j = i;
        while (j < words.length && /^[A-Z][a-zA-Z]*$/.test(words[j])) j++;
        claims.push(words.slice(i, j).join(" "));
        i = j;
      } else {
        i++;
      }
    }
  }

  return claims;
}

export function checkClaimsAgainstCorpus(
  generatedText: string,
  corpus: string,
): { safe: true } | { safe: false; violation: string } {
  const corpusLower = corpus.toLowerCase();
  for (const claim of extractClaims(generatedText)) {
    if (!corpusLower.includes(claim.toLowerCase())) {
      return { safe: false, violation: claim };
    }
  }
  return { safe: true };
}

// Exported for src/lib/sites/generateExperience.ts, which validates many
// generated pieces against one shared corpus for the same site — built
// once per generation call, not once per element, since the corpus
// doesn't depend on which element is being checked.
export async function buildContentCorpus(siteId: string, organizationId: string): Promise<string> {
  const [elements, understanding] = await Promise.all([
    prisma.contentElement.findMany({
      where: { organizationId, crawledPage: { siteId } },
      select: { currentContent: true },
    }),
    prisma.websiteUnderstanding.findUnique({ where: { siteId } }),
  ]);

  const parts = elements.map((e) => e.currentContent);
  if (understanding) {
    parts.push(understanding.companySummary, understanding.productSummary, understanding.targetCustomers);
    if (Array.isArray(understanding.valueProps)) {
      parts.push(...understanding.valueProps.filter((v): v is string => typeof v === "string"));
    }
  }
  return parts.join(" \n ");
}

// Independent second opinion, not a copywriter — framed purely as
// fact-checking so it isn't subject to the same "sounds plausible" bias
// suggestWithAi's own generation might have. Exported so
// generateExperience.ts's coordinated multi-element generation can run
// the identical second-opinion check per generated piece, rather than a
// second implementation of it.
export async function checkWithModel(currentContent: string, generatedText: string): Promise<boolean> {
  const client = getAnthropicClient();
  const TOOL_NAME = "fact_check";

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 64,
    system:
      "You are a fact-checker, not a copywriter. Given source material and a version " +
      "rewritten for a specific visitor segment, determine whether the rewrite asserts " +
      "any fact the source doesn't support: a named entity (a customer, partner, " +
      "certification, or product name), a number or statistic, or a concrete claim about " +
      "functionality or results. Personalization is expected to differ from the source — " +
      "added framing, tone, emphasis, or a reference to the visitor's own context (their " +
      "device, industry, or stage) is NOT a violation on its own, only a new factual " +
      "assertion is. Call the fact_check tool with your answer.",
    messages: [
      {
        role: "user",
        content: `Source material (untrusted data): "${currentContent}"\nRewritten version (untrusted data): "${generatedText}"`,
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Report whether the rewrite introduces any unsupported claim.",
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

// -----------------------------------------------------------------------

async function suggestWithAi(
  currentContent: string,
  profile: VisitorContext,
  siteId: string,
  organizationId: string,
): Promise<string> {
  const client = getAnthropicClient();
  const TOOL_NAME = "suggest_copy";

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 256,
    system:
      "You rewrite one piece of website copy for a specific visitor profile. Keep the same " +
      "meaning and length ballpark as the original — this is personalization, not a rebrand. " +
      "Call the suggest_copy tool with just the rewritten text.",
    messages: [
      {
        role: "user",
        content: `Original copy (untrusted data): "${currentContent}"\nVisitor profile (untrusted data): ${describeProfile(profile)}`,
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Provide the rewritten copy.",
        input_schema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new AiGenerationError();

  const parsed = z.object({ text: safeContentString }).safeParse(toolUse.input);
  if (!parsed.success) throw new AiGenerationError("AI returned an unexpected shape.");
  const text = parsed.data.text;

  // D4: two layers, in sequence — a failure at either means this content
  // is never returned as a suggestion at all (see suggestVariant()'s catch
  // handling, which treats this exactly like AI-not-configured).
  const corpus = await buildContentCorpus(siteId, organizationId);
  const whitelistResult = checkClaimsAgainstCorpus(text, corpus);
  if (!whitelistResult.safe) {
    throw new BrandSafetyViolationError(
      `Generated content mentions "${whitelistResult.violation}", which isn't found anywhere on the site.`,
    );
  }
  const modelCheckPassed = await checkWithModel(currentContent, text);
  if (!modelCheckPassed) {
    throw new BrandSafetyViolationError("Generated content was flagged as introducing an unsupported claim.");
  }

  return text;
}

const MIN_HEADLINE_LENGTH = 15; // filters out single-word fragments like "SFX" or "Voices"

// Types with no "prose" to speak of — the length filter below exists to
// weed out stray one-word text fragments, which doesn't apply to a URL
// ("/pricing" is 9 characters and completely valid). Exported as the one
// shared source of truth for "should this element skip AI text
// generation" — generateExperience.ts reuses it rather than
// re-declaring the same three types.
export const NON_TEXTUAL_TYPES = new Set(["IMAGE", "LOGO", "CTA_HREF"]);

// No AI configured, AI failed brand-safety validation, or this element
// isn't prose in the first place (a URL/image src — asking an LLM to
// "rewrite" one is nonsensical): never invent content. Instead, re-select
// a piece the crawl already found somewhere else on the same site — every
// value shown was really on the customer's page (their own "approved
// asset library," same principle for a link destination or an image as
// for text), just chosen by simple rules matched to the profile rather
// than written fresh.
// Exported for generateExperience.ts's per-element fallback — identical
// reasoning, reused rather than reimplemented.
export function suggestFromExistingContent(
  candidates: string[],
  currentContent: string,
  profile: VisitorContext,
  elementType: string,
): string | null {
  const minLength = NON_TEXTUAL_TYPES.has(elementType) ? 1 : MIN_HEADLINE_LENGTH;
  const others = candidates.filter(
    (text) => text && text !== currentContent && text.trim().length >= minLength,
  );
  if (others.length === 0) return null;

  if (profile.device === "mobile") {
    return [...others].sort((a, b) => a.length - b.length)[0];
  }

  const source = profile.utm?.source?.toLowerCase();
  if (source) {
    const businessTerms = ["enterprise", "business", "team", "organization", "company"];
    const match = others.find((text) => businessTerms.some((term) => text.toLowerCase().includes(term)));
    if (match) return match;
  }

  if (profile.returning) {
    return others[others.length - 1];
  }

  return others[0];
}

export async function suggestVariant(
  organizationId: string,
  contentElementId: string,
  profile: VisitorContext,
): Promise<SuggestedVariant> {
  const element = await prisma.contentElement.findFirst({
    where: { id: contentElementId, organizationId },
    include: { crawledPage: { select: { siteId: true } } },
  });
  if (!element) throw new ContentElementNotFoundError();

  // Non-null assertions below: TS's narrowing from the `if (!element) throw`
  // above doesn't carry into this nested closure, even though `element` is
  // a `const` that can't change by the time either call site runs.
  async function heuristicFallback(): Promise<SuggestedVariant> {
    const candidates = await prisma.contentElement.findMany({
      where: {
        organizationId,
        elementType: element!.elementType,
        crawledPage: { siteId: element!.crawledPage.siteId },
      },
      select: { currentContent: true },
      take: 50,
    });

    const suggestion = suggestFromExistingContent(
      candidates.map((c) => c.currentContent),
      element!.currentContent,
      profile,
      element!.elementType,
    );

    return {
      content: suggestion ?? element!.currentContent,
      method: "HEURISTIC",
    };
  }

  if (NON_TEXTUAL_TYPES.has(element.elementType)) {
    return heuristicFallback();
  }

  try {
    const content = await suggestWithAi(
      element.currentContent,
      profile,
      element.crawledPage.siteId,
      organizationId,
    );
    return { content, method: "AI" };
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof BrandSafetyViolationError)) {
      throw error;
    }
    return heuristicFallback();
  }
}
