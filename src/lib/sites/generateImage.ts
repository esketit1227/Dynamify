import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { env } from "@/lib/env";
import { ImageGenerationNotConfiguredError, AiGenerationError } from "@/lib/ai/errors";
import { effectiveBoundary, shouldAutoApprove } from "@/lib/sites/boundaries";
import {
  ContentElementNotFoundError,
  AudienceNotFoundError,
  assertBoundaryAllows,
  toDTO,
  type ElementPersonalizationRuleDTO,
} from "@/lib/sites/personalization";
import type { ContentElementType, ContentSection, RuleOperator } from "@/generated/prisma/client";

export class NotAnImageElementError extends HttpError {
  constructor() {
    super(400, "AI image generation only applies to IMAGE or LOGO elements.");
  }
}

const IMAGE_TYPES = new Set<ContentElementType>(["IMAGE", "LOGO"]);

// Plain-language description of an audience's own targeting rules —
// image generation is triggered from a UI where the user already picked
// an audienceId from a dropdown (not a simulated live visitor, unlike
// text suggest-variant's describeProfile in suggestVariant.ts), so the
// prompt is steered by what that audience actually targets.
export function describeAudience(rules: { field: string; operator: RuleOperator; value: unknown }[]): string {
  if (rules.length === 0) return "a general visitor";
  return rules.map((r) => `${r.field} ${r.operator.toLowerCase().replace("_", " ")} ${r.value}`).join(", ");
}

type PromptInputs = {
  elementSection: ContentSection;
  understanding: { companySummary: string; productSummary: string; brandTone: unknown } | null;
  audienceDescription: string;
  brief?: string;
};

// Pure, no I/O — brand/product/tone context steers the generation toward
// something plausible, but this is best-effort prompting, not a
// verification layer; the PENDING approval gate every rule already goes
// through is the actual safety net for generated imagery (no automated
// visual brand-safety check exists, unlike D4's two-layer text check —
// see docs/roadmap.md's Phase 6 note for why).
export function buildImagePrompt(input: PromptInputs): string {
  const parts: string[] = [`A ${input.elementSection.toLowerCase()} image for a website.`];

  if (input.understanding) {
    parts.push(`Company: ${input.understanding.companySummary}`);
    parts.push(`Product: ${input.understanding.productSummary}`);
    const tone = input.understanding.brandTone as { tone?: unknown } | null;
    if (tone && Array.isArray(tone.tone) && tone.tone.length > 0) {
      parts.push(`Brand tone: ${tone.tone.join(", ")}`);
    }
  }

  parts.push(`Intended for: ${input.audienceDescription}.`);
  if (input.brief) parts.push(input.brief);
  parts.push("Photographic, professional, no text or logos rendered in the image itself.");

  return parts.join(" ");
}

const MAX_DATA_URI_LENGTH = 8_000_000; // ~8MB base64 — well above a 1024x1024 PNG, defensive cap

const openAiImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
});

// Deliberately checks configuration before any network call — same
// posture as enrichIp (src/lib/enrichment/ipFirmographics.ts): a missing
// key is never user-facing here, so there's nothing to degrade
// gracefully into except "this didn't happen."
async function callOpenAiImage(prompt: string): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new ImageGenerationNotConfiguredError();

  let response: Response;
  try {
    response = await fetch(`${env.OPENAI_IMAGE_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        size: "1024x1024",
        n: 1,
        response_format: "b64_json",
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AiGenerationError("Image generation request failed. Try again.");
  }

  if (!response.ok) throw new AiGenerationError("Image generation failed. Try again.");

  const parsed = openAiImageResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new AiGenerationError("Image provider returned an unexpected shape.");

  const b64 = parsed.data.data[0].b64_json;
  if (b64.length > MAX_DATA_URI_LENGTH) throw new AiGenerationError("Generated image was unexpectedly large.");

  return `data:image/png;base64,${b64}`;
}

// Creates a real, PENDING ElementPersonalizationRule directly — not
// through createElementPersonalization's schema (src/lib/sites/personalization.ts),
// which caps content at 2000 characters and blanket-rejects any `data:`
// scheme (a real XSS vector for arbitrary human/AI *text* input, e.g.
// data:text/html). That check stays exactly as strict as it is for that
// path; this is a different path with different, appropriate validation
// for what it actually produces (see docs/roadmap.md's Phase 6 note).
export async function generateImageVariant(
  organizationId: string,
  contentElementId: string,
  input: { audienceId: string; brief?: string; acknowledgedRestricted?: boolean },
): Promise<ElementPersonalizationRuleDTO> {
  const [element, audience] = await Promise.all([
    prisma.contentElement.findFirst({
      where: { id: contentElementId, organizationId },
      include: { crawledPage: { select: { siteId: true } } },
    }),
    prisma.audience.findFirst({ where: { id: input.audienceId, organizationId }, include: { rules: true } }),
  ]);
  if (!element) throw new ContentElementNotFoundError();
  if (!audience) throw new AudienceNotFoundError();
  if (!IMAGE_TYPES.has(element.elementType)) throw new NotAnImageElementError();
  // Checked before any network call, same posture as the missing-config
  // check below — never spend the paid API call on something about to
  // be blocked.
  assertBoundaryAllows(element, input.acknowledgedRestricted ?? false);

  const [understanding, site] = await Promise.all([
    prisma.websiteUnderstanding.findUnique({
      where: { siteId: element.crawledPage.siteId },
      select: { companySummary: true, productSummary: true, brandTone: true },
    }),
    prisma.site.findUniqueOrThrow({
      where: { id: element.crawledPage.siteId },
      select: { autoApproveAiContent: true },
    }),
  ]);

  const prompt = buildImagePrompt({
    elementSection: element.section,
    understanding,
    audienceDescription: describeAudience(audience.rules),
    brief: input.brief,
  });

  const dataUri = await callOpenAiImage(prompt);

  // Re-derived here (not trusted from earlier in this function) since
  // it's the actual condition that decides the rule's live status.
  const autoApprove = shouldAutoApprove(site.autoApproveAiContent, effectiveBoundary(element));

  const rule = await prisma.$transaction(async (tx) => {
    const variant = await tx.elementVariant.create({
      data: { organizationId, contentElementId, content: dataUri, method: "AI" },
    });
    return tx.elementPersonalizationRule.create({
      data: {
        organizationId,
        contentElementId,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: 0,
        status: autoApprove ? "APPROVED" : "PENDING",
      },
      include: { audience: { select: { name: true } }, elementVariant: true },
    });
  });

  return toDTO(rule);
}
