import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { toAudienceDTO, toAudienceDetailDTO, type AudienceDTO, type AudienceDetailDTO } from "./dto";
import type { CreateAudienceInput, UpdateAudienceInput } from "@/lib/validation/audiences";

export class AudienceNotFoundError extends HttpError {
  constructor() {
    super(404, "Audience not found");
  }
}

export async function listAudiences(organizationId: string): Promise<AudienceDTO[]> {
  const audiences = await prisma.audience.findMany({
    where: { organizationId },
    include: { _count: { select: { rules: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return audiences.map(toAudienceDTO);
}

export async function getAudience(
  organizationId: string,
  audienceId: string,
): Promise<AudienceDetailDTO> {
  const audience = await prisma.audience.findFirst({
    where: { id: audienceId, organizationId },
    include: { rules: true },
  });
  if (!audience) throw new AudienceNotFoundError();
  return toAudienceDetailDTO(audience);
}

export async function createAudience(
  organizationId: string,
  input: CreateAudienceInput,
): Promise<AudienceDetailDTO> {
  const audience = await prisma.audience.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      rules: {
        create: input.rules.map((rule) => ({
          organizationId,
          field: rule.field,
          operator: rule.operator,
          value: rule.value,
          groupIndex: rule.groupIndex,
        })),
      },
    },
    include: { rules: true },
  });
  return toAudienceDetailDTO(audience);
}

// Rules are replaced wholesale on update rather than diffed — simpler and
// correct for the editor's "save the whole rule set" UX; the audience id
// itself is stable, so PersonalizationRules referencing it are unaffected.
export async function updateAudience(
  organizationId: string,
  audienceId: string,
  input: UpdateAudienceInput,
): Promise<AudienceDetailDTO> {
  const existing = await prisma.audience.findFirst({
    where: { id: audienceId, organizationId },
  });
  if (!existing) throw new AudienceNotFoundError();

  const audience = await prisma.$transaction(async (tx) => {
    await tx.audienceRule.deleteMany({ where: { audienceId } });
    return tx.audience.update({
      where: { id: audienceId },
      data: {
        name: input.name,
        description: input.description,
        rules: {
          create: input.rules.map((rule) => ({
            organizationId,
            field: rule.field,
            operator: rule.operator,
            value: rule.value,
            groupIndex: rule.groupIndex,
          })),
        },
      },
      include: { rules: true },
    });
  });

  return toAudienceDetailDTO(audience);
}

// Cold-start (docs/roadmap.md Hardening): a brand-new site connects to a
// blank Audiences page, and behavioral targeting (attributes.stage/
// intentScore) has nothing to work with until a tracked visitor has real
// history — weeks of no value on exactly the account most likely to
// churn before seeing any. This doesn't build content (no
// ElementPersonalizationRule/ElementVariant — that still needs a human
// or the existing AI-suggestion flow); it just removes the "start from
// nothing" friction on the targeting side, using the exact same
// prisma.audience.create shape createAudience already uses above.
//
// Idempotent: a no-op whenever the org already has any audience, whether
// from a prior seed or because the org built its own — never overwrites
// or duplicates. Called once, from runCrawlAndUnderstand's success path
// (src/lib/sites/service.ts), on a site's first successful connection.
const DEFAULT_AUDIENCES = [
  {
    name: "New visitors",
    description: "Visiting for the first time, as far as we can tell.",
    field: "returning",
    operator: "EQUALS" as const,
    value: false,
  },
  {
    name: "Returning visitors",
    description: "Anyone who's been to the site before.",
    field: "returning",
    operator: "EQUALS" as const,
    value: true,
  },
  {
    name: "Mobile visitors",
    description: "Visiting from a phone.",
    field: "device",
    operator: "EQUALS" as const,
    value: "mobile",
  },
];

export async function seedDefaultAudiences(organizationId: string): Promise<void> {
  // Accepted race, not locked against: two sites in the same brand-new
  // org finishing their first crawl at literally the same moment could
  // both pass this check before either creates anything, producing
  // duplicate starter audiences. Low-likelihood (a new org connecting two
  // sites simultaneously) and low-severity (cosmetic duplicates, easy to
  // delete) — not worth a lock for.
  const existingCount = await prisma.audience.count({ where: { organizationId } });
  if (existingCount > 0) return;

  for (const preset of DEFAULT_AUDIENCES) {
    await prisma.audience.create({
      data: {
        organizationId,
        name: preset.name,
        description: preset.description,
        rules: {
          create: [{ organizationId, field: preset.field, operator: preset.operator, value: preset.value, groupIndex: 0 }],
        },
      },
    });
  }
}

export async function deleteAudience(organizationId: string, audienceId: string): Promise<void> {
  const existing = await prisma.audience.findFirst({
    where: { id: audienceId, organizationId },
  });
  if (!existing) throw new AudienceNotFoundError();

  await prisma.audience.delete({ where: { id: audienceId } });
}
