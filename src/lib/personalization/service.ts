import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import type { Prisma } from "@/generated/prisma/client";
import type { CreatePersonalizationInput } from "@/lib/validation/pages";

export class ComponentNotFoundError extends HttpError {
  constructor() {
    super(404, "Component not found");
  }
}

export class AudienceNotFoundError extends HttpError {
  constructor() {
    super(404, "Audience not found");
  }
}

export class PersonalizationRuleNotFoundError extends HttpError {
  constructor() {
    super(404, "Personalization rule not found");
  }
}

// The "who sees this -> what they see" pairing (product-spec §8). Creates
// the variant content and the rule binding it to an audience together, and
// verifies both the component and the audience actually belong to this org
// — never trust a client-supplied audienceId without checking it.
export async function createPersonalization(
  organizationId: string,
  componentId: string,
  input: CreatePersonalizationInput,
) {
  const [component, audience] = await Promise.all([
    prisma.component.findFirst({ where: { id: componentId, organizationId } }),
    prisma.audience.findFirst({ where: { id: input.audienceId, organizationId } }),
  ]);
  if (!component) throw new ComponentNotFoundError();
  if (!audience) throw new AudienceNotFoundError();

  const rule = await prisma.$transaction(async (tx) => {
    const variant = await tx.componentVariant.create({
      data: {
        organizationId,
        componentId,
        content: input.content as Prisma.InputJsonValue,
      },
    });

    return tx.personalizationRule.create({
      data: {
        organizationId,
        componentId,
        audienceId: audience.id,
        componentVariantId: variant.id,
        priority: input.priority,
      },
      include: { audience: { select: { name: true } }, componentVariant: true },
    });
  });

  return {
    id: rule.id,
    audienceId: rule.audienceId,
    audienceName: rule.audience.name,
    componentVariantId: rule.componentVariantId,
    content: rule.componentVariant.content as Record<string, unknown>,
    priority: rule.priority,
  };
}

export async function deletePersonalizationRule(
  organizationId: string,
  ruleId: string,
): Promise<void> {
  const rule = await prisma.personalizationRule.findFirst({
    where: { id: ruleId, organizationId },
  });
  if (!rule) throw new PersonalizationRuleNotFoundError();

  // The variant only ever exists for this one rule in the Phase 2 editor
  // (one audience -> one variant), so clean it up too rather than leaving an
  // orphaned row with nothing pointing at it.
  await prisma.$transaction([
    prisma.personalizationRule.delete({ where: { id: ruleId } }),
    prisma.componentVariant.delete({ where: { id: rule.componentVariantId } }),
  ]);
}
