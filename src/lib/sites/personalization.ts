import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { effectiveBoundary } from "@/lib/sites/boundaries";
import type {
  ContentElementType,
  PersonalizationBoundary,
  PersonalizationRuleStatus,
  VariantMethod,
} from "@/generated/prisma/client";

export class ContentElementNotFoundError extends HttpError {
  constructor() {
    super(404, "Content element not found");
  }
}

export class AudienceNotFoundError extends HttpError {
  constructor() {
    super(404, "Audience not found");
  }
}

export class ElementPersonalizationRuleNotFoundError extends HttpError {
  constructor() {
    super(404, "Personalization rule not found");
  }
}

// Product-spec.md §14. A hard block — unlike RESTRICTED, there is no
// per-request acknowledgment that gets past this; the only way through
// is an explicit, separate boundary change (setElementBoundary below).
export class PersonalizationBoundaryBlockedError extends HttpError {
  constructor() {
    super(400, "This element is marked \"never personalize\" and can't be targeted.");
  }
}

// RESTRICTED isn't blocked outright — it requires the caller to say so
// explicitly (acknowledgedRestricted), never inferred from anything the
// client didn't actually confirm.
export class PersonalizationBoundaryNeedsAcknowledgmentError extends HttpError {
  constructor() {
    super(400, "This element is restricted — confirm you want to personalize it anyway.");
  }
}

// Never trust the client's own claim about a boundary it didn't fetch
// itself — re-derive the effective boundary server-side from the real
// element every time. NEVER always throws; RESTRICTED throws unless the
// caller explicitly acknowledged it. Exported so every rule-creation path
// (this file's createElementPersonalization, and generateImage.ts's
// generateImageVariant) enforces the identical check rather than each
// reimplementing it.
export function assertBoundaryAllows(
  element: { elementType: ContentElementType; personalizationBoundary: PersonalizationBoundary | null },
  acknowledgedRestricted: boolean,
): void {
  const boundary = effectiveBoundary(element);
  if (boundary === "NEVER") throw new PersonalizationBoundaryBlockedError();
  if (boundary === "RESTRICTED" && !acknowledgedRestricted) {
    throw new PersonalizationBoundaryNeedsAcknowledgmentError();
  }
}

export type ElementPersonalizationRuleDTO = {
  id: string;
  contentElementId: string;
  audienceId: string;
  audienceName: string;
  elementVariantId: string;
  content: string;
  priority: number;
  status: PersonalizationRuleStatus;
  method: VariantMethod;
};

// Exported for src/lib/sites/generateImage.ts, which builds an
// ElementPersonalizationRule directly (its own validation, not
// createElementPersonalization's schema — see docs/roadmap.md's Phase 6
// image-generation note) but returns the exact same DTO shape.
export function toDTO(rule: {
  id: string;
  contentElementId: string;
  audienceId: string;
  priority: number;
  status: PersonalizationRuleStatus;
  audience: { name: string };
  elementVariantId: string;
  elementVariant: { content: string; method: VariantMethod };
}): ElementPersonalizationRuleDTO {
  return {
    id: rule.id,
    contentElementId: rule.contentElementId,
    audienceId: rule.audienceId,
    audienceName: rule.audience.name,
    elementVariantId: rule.elementVariantId,
    content: rule.elementVariant.content,
    priority: rule.priority,
    status: rule.status,
    method: rule.elementVariant.method,
  };
}

// The "who sees this -> what they see" pairing, retargeted at ContentElement
// (see docs/roadmap.md — the Component-targeted version of this exists for
// the superseded page-hosting model; Audience/AudienceRule are reused
// unchanged since they never referenced Component at all). Verifies both
// the element and the audience actually belong to this org before linking
// them — never trust a client-supplied audienceId without checking it.
export async function createElementPersonalization(
  organizationId: string,
  contentElementId: string,
  input: {
    audienceId: string;
    content: string;
    priority: number;
    method: VariantMethod;
    acknowledgedRestricted?: boolean;
    // Set only by src/lib/sites/generateExperience.ts, to link this rule
    // into the coordinated batch it was generated as part of. Every other
    // caller (the manual personalize flow, suggest-variant) leaves this
    // undefined, exactly like today.
    generatedExperienceId?: string;
  },
): Promise<ElementPersonalizationRuleDTO> {
  const [element, audience] = await Promise.all([
    prisma.contentElement.findFirst({ where: { id: contentElementId, organizationId } }),
    prisma.audience.findFirst({ where: { id: input.audienceId, organizationId } }),
  ]);
  if (!element) throw new ContentElementNotFoundError();
  if (!audience) throw new AudienceNotFoundError();
  assertBoundaryAllows(element, input.acknowledgedRestricted ?? false);

  const rule = await prisma.$transaction(async (tx) => {
    const variant = await tx.elementVariant.create({
      data: { organizationId, contentElementId, content: input.content, method: input.method },
    });

    return tx.elementPersonalizationRule.create({
      data: {
        organizationId,
        contentElementId,
        audienceId: audience.id,
        elementVariantId: variant.id,
        priority: input.priority,
        generatedExperienceId: input.generatedExperienceId,
      },
      include: { audience: { select: { name: true } }, elementVariant: true },
    });
  });

  return toDTO(rule);
}

// Read-modeled rollup (see GeneratedExperience's schema comment): the
// experience's own status is never written directly by a per-rule action,
// it's always recomputed from the rules that currently belong to it. All
// APPROVED -> APPROVED; all DISABLED -> REJECTED (every piece was
// individually turned off, same practical outcome as rejecting the whole
// batch); all PENDING -> PENDING (nothing decided yet); anything mixed ->
// PARTIALLY_APPROVED. No rules left (batch rejection deletes them all) ->
// REJECTED.
// Exported for generateExperience.ts's approve-all/reject-all batch
// actions, which mutate many rules in one call and need the same rollup
// applied once at the end rather than reimplemented.
export async function recomputeGeneratedExperienceStatus(generatedExperienceId: string): Promise<void> {
  const rules = await prisma.elementPersonalizationRule.findMany({
    where: { generatedExperienceId },
    select: { status: true },
  });

  let status: "PENDING" | "PARTIALLY_APPROVED" | "APPROVED" | "REJECTED";
  if (rules.length === 0) status = "REJECTED";
  else if (rules.every((r) => r.status === "APPROVED")) status = "APPROVED";
  else if (rules.every((r) => r.status === "DISABLED")) status = "REJECTED";
  else if (rules.every((r) => r.status === "PENDING")) status = "PENDING";
  else status = "PARTIALLY_APPROVED";

  await prisma.generatedExperience.update({ where: { id: generatedExperienceId }, data: { status } });
}

async function setStatus(
  organizationId: string,
  ruleId: string,
  status: PersonalizationRuleStatus,
): Promise<ElementPersonalizationRuleDTO> {
  const existing = await prisma.elementPersonalizationRule.findFirst({
    where: { id: ruleId, organizationId },
  });
  if (!existing) throw new ElementPersonalizationRuleNotFoundError();

  const rule = await prisma.elementPersonalizationRule.update({
    where: { id: ruleId },
    data: { status },
    include: { audience: { select: { name: true } }, elementVariant: true },
  });

  if (existing.generatedExperienceId) {
    await recomputeGeneratedExperienceStatus(existing.generatedExperienceId);
  }

  return toDTO(rule);
}

// "Nothing goes live unapproved" (docs/roadmap.md Phase 3) — every rule is
// created PENDING; resolve() only ever sees APPROVED ones
// (getLiveViewDefinition is the one choke point that filters on this).
// This is the explicit human action that makes a rule live.
export async function approveElementPersonalizationRule(
  organizationId: string,
  ruleId: string,
): Promise<ElementPersonalizationRuleDTO> {
  return setStatus(organizationId, ruleId, "APPROVED");
}

// Reversibility (docs/roadmap.md Phase 3 exit criterion) without losing the
// configuration — unlike delete, the rule and its variant survive, so
// re-enabling is instant and the original crawled content
// (ContentElement.currentContent, never mutated) was always one click away
// regardless. resolve() excludes DISABLED the same way it excludes
// PENDING: only APPROVED is ever included.
export async function disableElementPersonalizationRule(
  organizationId: string,
  ruleId: string,
): Promise<ElementPersonalizationRuleDTO> {
  return setStatus(organizationId, ruleId, "DISABLED");
}

export async function enableElementPersonalizationRule(
  organizationId: string,
  ruleId: string,
): Promise<ElementPersonalizationRuleDTO> {
  return setStatus(organizationId, ruleId, "APPROVED");
}

export async function deleteElementPersonalizationRule(
  organizationId: string,
  ruleId: string,
): Promise<void> {
  const rule = await prisma.elementPersonalizationRule.findFirst({
    where: { id: ruleId, organizationId },
  });
  if (!rule) throw new ElementPersonalizationRuleNotFoundError();

  // The variant only ever exists for this one rule in this editor (one
  // audience -> one variant), so clean it up too rather than leaving an
  // orphaned row nothing points at.
  await prisma.$transaction([
    prisma.elementPersonalizationRule.delete({ where: { id: ruleId } }),
    prisma.elementVariant.delete({ where: { id: rule.elementVariantId } }),
  ]);

  if (rule.generatedExperienceId) {
    await recomputeGeneratedExperienceStatus(rule.generatedExperienceId);
  }
}

// The explicit, separate escape hatch product-spec.md §14 calls for
// ("the user should be able to control what the AI is allowed to
// change") — unlike acknowledgedRestricted (a one-time confirmation on a
// single request), this persists a real per-element override.
// `boundary: null` resets the element back to its type default
// (src/lib/sites/boundaries.ts) rather than leaving a stale override
// behind.
export async function setElementBoundary(
  organizationId: string,
  contentElementId: string,
  boundary: PersonalizationBoundary | null,
): Promise<{ id: string; boundary: PersonalizationBoundary; boundaryOverride: PersonalizationBoundary | null }> {
  const element = await prisma.contentElement.findFirst({
    where: { id: contentElementId, organizationId },
  });
  if (!element) throw new ContentElementNotFoundError();

  const updated = await prisma.contentElement.update({
    where: { id: contentElementId },
    data: { personalizationBoundary: boundary },
  });

  return {
    id: updated.id,
    boundary: effectiveBoundary(updated),
    boundaryOverride: updated.personalizationBoundary,
  };
}
