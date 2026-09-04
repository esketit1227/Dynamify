import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { AiNotConfiguredError, AiGenerationError, ImageGenerationNotConfiguredError } from "@/lib/ai/errors";
import { safeContentString } from "@/lib/validation/pages";
import { CrawledPageNotFoundError } from "@/lib/liveview/service";
import { effectiveBoundary } from "@/lib/sites/boundaries";
import {
  AudienceNotFoundError,
  createElementPersonalization,
  recomputeGeneratedExperienceStatus,
  toDTO,
  type ElementPersonalizationRuleDTO,
} from "@/lib/sites/personalization";
import { generateImageVariant, describeAudience } from "@/lib/sites/generateImage";
import {
  buildContentCorpus,
  checkClaimsAgainstCorpus,
  checkWithModel,
  suggestFromExistingContent,
  NON_TEXTUAL_TYPES,
} from "@/lib/sites/suggestVariant";
import type {
  ContentElementType,
  ContentSection,
  GeneratedExperienceStatus,
  PersonalizationBoundary,
} from "@/generated/prisma/client";

export class NoEligibleElementsError extends HttpError {
  constructor() {
    super(400, "No personalizable elements on this page allow generation right now.");
  }
}

export class NoContentGeneratedError extends HttpError {
  constructor() {
    super(502, "Generation didn't produce any usable content. Try again.");
  }
}

export class GeneratedExperienceNotFoundError extends HttpError {
  constructor() {
    super(404, "Generated experience not found");
  }
}

export type PreviewElementDTO = {
  id: string;
  elementType: ContentElementType;
  section: ContentSection;
  currentContent: string;
};

export type GeneratedExperienceDTO = {
  id: string;
  crawledPageId: string;
  pageUrl: string;
  audienceId: string;
  audienceName: string;
  status: GeneratedExperienceStatus;
  createdAt: string;
  rules: ElementPersonalizationRuleDTO[];
  // The page's full element set (default content, not just the ones this
  // batch touched) — carried on the DTO so a caller can render a
  // before/after preview (see RenderedPreview) from this one payload,
  // without a second fetch keyed off crawledPageId.
  pageElements: PreviewElementDTO[];
};

function toExperienceDTO(experience: {
  id: string;
  crawledPageId: string;
  audienceId: string;
  status: GeneratedExperienceStatus;
  createdAt: Date;
  crawledPage: { url: string; elements: PreviewElementDTO[] };
  audience: { name: string };
  rules: Parameters<typeof toDTO>[0][];
}): GeneratedExperienceDTO {
  return {
    id: experience.id,
    crawledPageId: experience.crawledPageId,
    pageUrl: experience.crawledPage.url,
    audienceId: experience.audienceId,
    audienceName: experience.audience.name,
    status: experience.status,
    createdAt: experience.createdAt.toISOString(),
    rules: experience.rules.map(toDTO),
    pageElements: experience.crawledPage.elements,
  };
}

const EXPERIENCE_INCLUDE = {
  crawledPage: {
    select: {
      url: true,
      elements: { select: { id: true, elementType: true, section: true, currentContent: true } },
    },
  },
  audience: { select: { name: true } },
  rules: { include: { audience: { select: { name: true } }, elementVariant: true } },
} as const;

// Defensive cap on how many elements go into one coordinated prompt — no
// real page in this app has come close to this, but an unbounded prompt
// size is still worth guarding against explicitly rather than trusting it
// implicitly (same posture as understand.ts's own element cap).
const MAX_ELEMENTS_PER_GENERATION = 40;

type EligibleElement = {
  id: string;
  elementType: ContentElementType;
  section: ContentSection;
  currentContent: string;
};

// Pure — same "who's actually in this batch" decision assertBoundaryAllows
// makes per element (src/lib/sites/personalization.ts), applied once
// up front to the whole page instead of per-request: NEVER is always
// excluded, RESTRICTED only included once the caller has acknowledged it
// for this generation. No I/O, so this is fully unit-testable on its own —
// exported for that reason.
export function filterEligibleElements<
  T extends { elementType: ContentElementType; personalizationBoundary: PersonalizationBoundary | null },
>(elements: T[], acknowledgedRestricted: boolean): T[] {
  return elements.filter((el) => {
    const boundary = effectiveBoundary(el);
    if (boundary === "NEVER") return false;
    if (boundary === "RESTRICTED" && !acknowledgedRestricted) return false;
    return true;
  });
}

// Pure prompt assembly, split out from generateCoordinatedCopy so it's
// unit-testable without a real Anthropic call — same split as
// generateImage.ts's buildImagePrompt vs. callOpenAiImage.
export function buildExperiencePrompt(
  elements: EligibleElement[],
  understanding: { companySummary: string; productSummary: string; targetCustomers: string } | null,
  audienceDescription: string,
): string {
  const elementLines = elements
    .map((e) => `- id: ${e.id} | type: ${e.elementType} | section: ${e.section} | current: "${e.currentContent}"`)
    .join("\n");

  const understandingText = understanding
    ? `Company: ${understanding.companySummary}\nProduct: ${understanding.productSummary}\nTarget customers: ${understanding.targetCustomers}`
    : "No additional brand context available.";

  return (
    `Visitor segment (untrusted data): ${audienceDescription}\n\n` +
    `Brand context (untrusted data):\n${understandingText}\n\n` +
    `Elements to rewrite (untrusted data):\n${elementLines}`
  );
}

// One coordinated call covering every textual element at once, so the
// headline/subhead/CTA/etc. read as one consistent story instead of
// independently-generated pieces — the actual capability suggest-variant
// can't offer (it only ever sees one element in isolation). Throws
// AiNotConfiguredError (via getAnthropicClient) exactly like
// suggestVariant.ts's suggestWithAi — callers here handle that the same
// way, by falling back to heuristic reselection per element.
async function generateCoordinatedCopy(
  elements: EligibleElement[],
  understanding: { companySummary: string; productSummary: string; targetCustomers: string } | null,
  audienceDescription: string,
): Promise<Map<string, string>> {
  const client = getAnthropicClient();
  const TOOL_NAME = "generate_experience";

  const response = await client.messages.create({
    model: AI_MODEL,
    // Up to MAX_ELEMENTS_PER_GENERATION (40) pieces come back in one response,
    // including full BODY paragraphs — a real page with 39 textual elements
    // hit stop_reason: "max_tokens" at the previous 2048 budget, truncating
    // the tool call mid-JSON and silently failing every element in the batch
    // (empty aiPieces -> every element falls back to HEURISTIC). Sized for
    // the batch cap, not the typical case.
    max_tokens: 16000,
    system:
      "You rewrite a coordinated set of website copy pieces for one visitor segment, so the " +
      "headline, subheadline, CTA, and any other pieces all tell the same consistent story " +
      "instead of reading as independently written. Keep each piece the same general meaning " +
      "and length ballpark as its original — this is personalization, not a rebrand. Call the " +
      "generate_experience tool with exactly one rewritten piece per element id you were given.",
    messages: [
      {
        role: "user",
        content: buildExperiencePrompt(elements, understanding, audienceDescription),
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Provide the coordinated rewritten copy, one piece per element id.",
        input_schema: {
          type: "object",
          properties: {
            pieces: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  elementId: { type: "string" },
                  text: { type: "string" },
                },
                required: ["elementId", "text"],
              },
            },
          },
          required: ["pieces"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new AiGenerationError();

  const parsed = z
    .object({
      pieces: z
        .array(z.object({ elementId: z.string(), text: safeContentString }))
        .max(MAX_ELEMENTS_PER_GENERATION),
    })
    .safeParse(toolUse.input);
  if (!parsed.success) throw new AiGenerationError("AI returned an unexpected shape.");

  // Never trust an element id the model invented — only ids from the real
  // set we sent it are ever usable.
  const knownIds = new Set(elements.map((e) => e.id));
  const map = new Map<string, string>();
  for (const piece of parsed.data.pieces) {
    if (knownIds.has(piece.elementId)) map.set(piece.elementId, piece.text);
  }
  return map;
}

// Same non-AI reselection suggest-variant falls back to (site-wide
// candidates of the same element type) — reused rather than
// reimplemented. No live VisitorContext exists at generation time (this
// targets a whole segment, not one simulated visitor), so an empty
// profile is passed deliberately: the heuristic just picks the first real
// alternative found elsewhere on the site, same as it would for "a
// general visitor."
async function heuristicPiece(element: EligibleElement, siteId: string, organizationId: string): Promise<string | null> {
  const candidates = await prisma.contentElement.findMany({
    where: { organizationId, elementType: element.elementType, crawledPage: { siteId } },
    select: { currentContent: true },
    take: 50,
  });
  return suggestFromExistingContent(
    candidates.map((c) => c.currentContent),
    element.currentContent,
    {},
    element.elementType,
  );
}

export type GenerateExperienceOptions = {
  acknowledgedRestricted?: boolean;
  // Off by default (docs/product-spec.md-scoped plan): also calls the
  // existing single-image pipeline for eligible IMAGE/LOGO elements,
  // rather than just reselecting an existing image found elsewhere on the
  // site.
  generateImages?: boolean;
};

// Orchestrates one coordinated, per-segment content bundle (see the
// GeneratedExperience schema comment and docs/roadmap.md's Hardening
// entry). Every created rule starts PENDING, same as every other
// personalization path — this function is deliberately not wired into
// Site.autoApproveAiContent itself; the one place auto-approve can still
// apply is inside generateImageVariant's own existing, narrower
// (ALLOWED-boundary images only) behavior when generateImages is true,
// unchanged from calling it one element at a time.
export async function generateExperience(
  organizationId: string,
  crawledPageId: string,
  audienceId: string,
  options: GenerateExperienceOptions = {},
): Promise<GeneratedExperienceDTO> {
  const [page, audience] = await Promise.all([
    prisma.crawledPage.findFirst({
      where: { id: crawledPageId, organizationId },
      select: { id: true, siteId: true, url: true },
    }),
    prisma.audience.findFirst({ where: { id: audienceId, organizationId }, include: { rules: true } }),
  ]);
  if (!page) throw new CrawledPageNotFoundError();
  if (!audience) throw new AudienceNotFoundError();

  const allElements = await prisma.contentElement.findMany({
    where: { crawledPageId, organizationId },
    select: { id: true, elementType: true, section: true, currentContent: true, personalizationBoundary: true },
    orderBy: { order: "asc" },
  });

  const acknowledgedRestricted = options.acknowledgedRestricted ?? false;
  const eligible: EligibleElement[] = filterEligibleElements(allElements, acknowledgedRestricted)
    .slice(0, MAX_ELEMENTS_PER_GENERATION)
    .map((el) => ({
      id: el.id,
      elementType: el.elementType,
      section: el.section,
      currentContent: el.currentContent,
    }));

  if (eligible.length === 0) throw new NoEligibleElementsError();

  const textual = eligible.filter((el) => !NON_TEXTUAL_TYPES.has(el.elementType));
  const nonTextual = eligible.filter((el) => NON_TEXTUAL_TYPES.has(el.elementType));

  const understanding = await prisma.websiteUnderstanding.findUnique({
    where: { siteId: page.siteId },
    select: { companySummary: true, productSummary: true, targetCustomers: true },
  });
  const audienceDescription = describeAudience(audience.rules);

  // Built once for the whole batch — the corpus doesn't depend on which
  // element is being checked (see buildContentCorpus's own comment).
  const corpus = textual.length > 0 ? await buildContentCorpus(page.siteId, organizationId) : "";

  let aiPieces = new Map<string, string>();
  if (textual.length > 0) {
    try {
      aiPieces = await generateCoordinatedCopy(textual, understanding, audienceDescription);
    } catch (error) {
      if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiGenerationError)) throw error;
      // No AI, or it failed outright — every textual piece falls back to
      // heuristic reselection below, same as an empty map would produce.
    }
  }

  // The experience row is created before any content pieces are attached
  // so an optional generateImageVariant call (below) always has a real id
  // to link into — content is added to it as each piece is decided, not
  // computed first and inserted all at once.
  const experience = await prisma.generatedExperience.create({
    data: { organizationId, crawledPageId, audienceId, status: "PENDING" },
  });

  const createdRuleIds: string[] = [];

  async function attachTextPiece(element: EligibleElement, content: string, method: "AI" | "HEURISTIC") {
    const rule = await createElementPersonalization(organizationId, element.id, {
      audienceId,
      content,
      priority: 0,
      method,
      acknowledgedRestricted,
      generatedExperienceId: experience.id,
    });
    createdRuleIds.push(rule.id);
  }

  for (const element of textual) {
    const candidate = aiPieces.get(element.id);
    let safe = false;
    if (candidate) {
      try {
        const whitelist = checkClaimsAgainstCorpus(candidate, corpus);
        safe = whitelist.safe && (await checkWithModel(element.currentContent, candidate));
      } catch (error) {
        if (!(error instanceof AiGenerationError)) throw error;
        safe = false;
      }
    }

    if (candidate && safe) {
      await attachTextPiece(element, candidate, "AI");
      continue;
    }

    const heuristic = await heuristicPiece(element, page.siteId, organizationId);
    if (heuristic) await attachTextPiece(element, heuristic, "HEURISTIC");
    // Neither an AI piece nor a real alternative elsewhere on the site —
    // this one element is simply left out of the batch, not a reason to
    // fail the whole generation.
  }

  for (const element of nonTextual) {
    const isImage = element.elementType === "IMAGE" || element.elementType === "LOGO";

    if (isImage && options.generateImages) {
      try {
        const rule = await generateImageVariant(organizationId, element.id, {
          audienceId,
          acknowledgedRestricted,
        });
        await prisma.elementPersonalizationRule.update({
          where: { id: rule.id },
          data: { generatedExperienceId: experience.id },
        });
        createdRuleIds.push(rule.id);
        continue;
      } catch (error) {
        if (!(error instanceof ImageGenerationNotConfiguredError) && !(error instanceof AiGenerationError)) {
          throw error;
        }
        // Falls through to the same heuristic reselection every other
        // non-textual element uses — an image-generation failure (not
        // configured, provider error) shouldn't fail the whole batch.
        // Anything else (a boundary error, not-found) means this
        // orchestration's own filtering has a real bug and should surface.
      }
    }

    const heuristic = await heuristicPiece(element, page.siteId, organizationId);
    if (heuristic) await attachTextPiece(element, heuristic, "HEURISTIC");
  }

  if (createdRuleIds.length === 0) {
    // Nothing usable came out of generation at all — don't leave an empty,
    // useless batch behind.
    await prisma.generatedExperience.delete({ where: { id: experience.id } });
    throw new NoContentGeneratedError();
  }

  // Reflects the real mix of statuses the rules ended up with (e.g. an
  // auto-approved image alongside PENDING text pieces), rather than
  // assuming everything landed PENDING.
  await recomputeGeneratedExperienceStatus(experience.id);

  const full = await prisma.generatedExperience.findUniqueOrThrow({
    where: { id: experience.id },
    include: EXPERIENCE_INCLUDE,
  });
  return toExperienceDTO(full);
}


async function requireExperience(organizationId: string, experienceId: string) {
  const experience = await prisma.generatedExperience.findFirst({
    where: { id: experienceId, organizationId },
    include: EXPERIENCE_INCLUDE,
  });
  if (!experience) throw new GeneratedExperienceNotFoundError();
  return experience;
}

export async function getGeneratedExperience(
  organizationId: string,
  experienceId: string,
): Promise<GeneratedExperienceDTO> {
  return toExperienceDTO(await requireExperience(organizationId, experienceId));
}

// Only ever advances a PENDING rule to APPROVED — a rule someone already
// individually disabled stays disabled, so approving the rest of the
// batch never overrides a decision a human already made on one piece.
export async function approveAllGeneratedExperience(
  organizationId: string,
  experienceId: string,
): Promise<GeneratedExperienceDTO> {
  const experience = await requireExperience(organizationId, experienceId);

  await prisma.elementPersonalizationRule.updateMany({
    where: { generatedExperienceId: experience.id, status: "PENDING" },
    data: { status: "APPROVED" },
  });
  await recomputeGeneratedExperienceStatus(experience.id);

  return getGeneratedExperience(organizationId, experienceId);
}

// Deletes the whole batch and every rule/variant in it — the explicit
// "discard this entirely" action, distinct from disabling one rule at a
// time via the normal per-element flow.
export async function rejectAllGeneratedExperience(organizationId: string, experienceId: string): Promise<void> {
  const experience = await requireExperience(organizationId, experienceId);
  const variantIds = experience.rules.map((r) => r.elementVariantId);

  await prisma.$transaction([
    prisma.elementPersonalizationRule.deleteMany({ where: { generatedExperienceId: experience.id } }),
    prisma.elementVariant.deleteMany({ where: { id: { in: variantIds } } }),
    prisma.generatedExperience.delete({ where: { id: experience.id } }),
  ]);
}
