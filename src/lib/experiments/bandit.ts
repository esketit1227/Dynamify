import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { hashString } from "@/lib/experiments/holdout";
import { computeArmStats, computeWeightA, type ArmStats } from "@/lib/experiments/banditStats";
import type { PageDefinition, ComponentDefinition } from "@dynamify/personalization-sdk";
import type { BanditExperimentStatus } from "@/generated/prisma/client";

// Multi-armed bandit traffic allocation (docs/decisions.md D11) — two
// already-*approved* variants competing for one (element, audience) slot.
// This file only ever decides ALLOCATION between rules a human already
// approved through the existing flow; it never creates, generates, or
// approves content. Same "pure, deterministic, no Math.random()/Date.now()"
// discipline as holdout.ts and packages/sdk itself — resolve() is never
// modified; this filters *inputs* to it instead, the same trick holdout.ts
// already uses successfully.

// Deterministic per (visitor, experiment) — salting with experimentId
// keeps two experiments running on the same visitor from correlating with
// each other. Never called for an untracked visitor — see
// applyBanditFiltering below for why an experiment simply doesn't apply to
// them, rather than guessing.
export function selectBanditArm(experimentId: string, visitorKey: string, weightA: number): "A" | "B" {
  return hashString(`${visitorKey}:${experimentId}`) % 100 < weightA * 100 ? "A" : "B";
}

type ExperimentRow = {
  id: string;
  contentElementId: string;
  ruleAId: string;
  ruleBId: string;
  weightA: number;
};

function filterComponent(component: ComponentDefinition, experiment: ExperimentRow, losingRuleId: string): ComponentDefinition {
  return {
    ...component,
    personalizationRules: component.personalizationRules.filter((rule) => rule.id !== losingRuleId),
  };
}

// The one new write-adjacent hook. Loads RUNNING experiments touching this
// page's components and, only for a visitor with a persistent identity,
// filters out the losing arm's rule before resolve() ever sees it — so
// resolve()'s own deterministic tie-break (packages/sdk/src/resolve.ts,
// untouched by this feature) has exactly one candidate from this
// experiment to consider, exactly as if only that one rule existed. Any
// *other* rule on the same component (a different audience entirely) is
// left completely alone.
//
// Called independently from both getEmbedElements (deciding what to show)
// and recordSiteEvent (deciding what to record) — src/lib/embed/service.ts
// — mirroring computeHeldOut's own "never trust either side, always
// re-derive" shape exactly, so the two can never disagree about which arm
// a given visitor saw.
export async function applyBanditFiltering(
  definition: PageDefinition,
  organizationId: string,
  visitorKey: string | undefined,
): Promise<PageDefinition> {
  // No persistent identity, no experiment participation — see
  // docs/decisions.md D11 for why Leads/Sales as the reward signal makes
  // this a hard requirement, not a preference: a lead or sale often
  // happens on a different page load than the one being tested, so only a
  // visitor with a stable seed across loads can be attributed correctly.
  // resolve()'s own existing tie-break governs unfiltered for everyone
  // else, exactly as it would with no experiment running at all.
  if (!visitorKey) return definition;

  const componentIds = definition.components.map((c) => c.id);
  if (componentIds.length === 0) return definition;

  const experiments = await prisma.banditExperiment.findMany({
    where: { organizationId, status: "RUNNING", contentElementId: { in: componentIds } },
    select: { id: true, contentElementId: true, ruleAId: true, ruleBId: true, weightA: true },
  });
  if (experiments.length === 0) return definition;

  const experimentByComponentId = new Map(experiments.map((e) => [e.contentElementId, e]));

  return {
    ...definition,
    components: definition.components.map((component) => {
      const experiment = experimentByComponentId.get(component.id);
      if (!experiment) return component;

      const arm = selectBanditArm(experiment.id, visitorKey, experiment.weightA);
      const losingRuleId = arm === "A" ? experiment.ruleBId : experiment.ruleAId;
      return filterComponent(component, experiment, losingRuleId);
    }),
  };
}

// The daily weight-recompute — folded into the existing auto-optimize cron
// (src/app/api/cron/auto-optimize/route.ts) rather than a second vercel.json
// entry, since Vercel Hobby only allows one run/day per cron and this
// project already has exactly one slot spent on runAutoOptimize. Reads
// fresh Impression/Conversion data for both arms of every RUNNING
// experiment and stores a new weightA; selectBanditArm (above) is the only
// thing that ever consumes it, and only on the next request after this
// runs. One experiment's failure is isolated and logged, never allowed to
// block the rest — same posture as runAutoOptimize's own per-org isolation.
export async function runBanditWeightUpdates(): Promise<{ updated: number }> {
  const experiments = await prisma.banditExperiment.findMany({ where: { status: "RUNNING" } });
  let updated = 0;
  for (const exp of experiments) {
    try {
      const [a, b] = await Promise.all([
        computeArmStats(exp.organizationId, exp.ruleAId),
        computeArmStats(exp.organizationId, exp.ruleBId),
      ]);
      await prisma.banditExperiment.update({ where: { id: exp.id }, data: { weightA: computeWeightA(a, b) } });
      updated++;
    } catch (error) {
      console.error(`bandit weight update failed for experiment ${exp.id}:`, error);
    }
  }
  return { updated };
}

// --- Creation, listing, stopping — the merchant-facing half -----------

export class ContentElementNotFoundError extends HttpError {
  constructor() {
    super(404, "Content element not found");
  }
}

export class BanditAudienceNotFoundError extends HttpError {
  constructor() {
    super(404, "Audience not found");
  }
}

export class BanditExperimentNotFoundError extends HttpError {
  constructor() {
    super(404, "Experiment not found");
  }
}

// Matches EmailInUseError/platformConnections' "already connected" —
// requireNoActiveExperiment from the plan, named as a class instead of an
// inline HttpError since "one RUNNING experiment per (element, audience)"
// is a real, nameable business rule (the schema comment on
// BanditExperiment explains why this is an app-layer check, not a DB
// constraint).
export class DuplicateBanditExperimentError extends HttpError {
  constructor() {
    super(409, "An experiment is already running for this element and audience");
  }
}

export type BanditExperimentDTO = {
  id: string;
  contentElementId: string;
  audienceId: string;
  audienceName: string;
  ruleAId: string;
  ruleBId: string;
  weightA: number;
  status: BanditExperimentStatus;
  createdAt: string;
};

function toDTO(experiment: {
  id: string;
  contentElementId: string;
  audienceId: string;
  ruleAId: string;
  ruleBId: string;
  weightA: number;
  status: BanditExperimentStatus;
  createdAt: Date;
  audience: { name: string };
}): BanditExperimentDTO {
  return {
    id: experiment.id,
    contentElementId: experiment.contentElementId,
    audienceId: experiment.audienceId,
    audienceName: experiment.audience.name,
    ruleAId: experiment.ruleAId,
    ruleBId: experiment.ruleBId,
    weightA: experiment.weightA,
    status: experiment.status,
    createdAt: experiment.createdAt.toISOString(),
  };
}

// Both rules must be real, org-scoped, targeting this exact element, and
// share the audienceId this experiment is for — the "slot" being
// contested is (contentElementId, audienceId), and APPROVED — the bandit
// only ever allocates between two things a human already approved through
// the existing flow (CLAUDE.md "nothing goes live unapproved"); it never
// approves anything itself.
async function assertValidArm(
  organizationId: string,
  contentElementId: string,
  audienceId: string,
  ruleId: string,
): Promise<void> {
  const rule = await prisma.elementPersonalizationRule.findFirst({
    where: { id: ruleId, organizationId, contentElementId },
  });
  if (!rule) throw new HttpError(404, "Personalization rule not found");
  if (rule.audienceId !== audienceId) {
    throw new HttpError(400, "Both rules must target the audience this experiment is for");
  }
  if (rule.status !== "APPROVED") {
    throw new HttpError(400, "Both rules must be approved before they can run as an experiment");
  }
}

export async function createBanditExperiment(
  organizationId: string,
  contentElementId: string,
  input: { audienceId: string; ruleAId: string; ruleBId: string },
): Promise<BanditExperimentDTO> {
  const [element, audience] = await Promise.all([
    prisma.contentElement.findFirst({ where: { id: contentElementId, organizationId } }),
    prisma.audience.findFirst({ where: { id: input.audienceId, organizationId } }),
  ]);
  if (!element) throw new ContentElementNotFoundError();
  if (!audience) throw new BanditAudienceNotFoundError();

  if (input.ruleAId === input.ruleBId) {
    throw new HttpError(400, "Choose two different rules to compete against each other");
  }
  await assertValidArm(organizationId, contentElementId, input.audienceId, input.ruleAId);
  await assertValidArm(organizationId, contentElementId, input.audienceId, input.ruleBId);

  // The application-layer substitute for a partial unique index (Postgres/
  // Prisma can't express "unique only when status=RUNNING" without raw
  // SQL) — see the schema comment on BanditExperiment. A race between two
  // concurrent creates for the same slot is not closed by this check
  // alone; acceptable here since this is a manual, low-frequency dashboard
  // action taken by a single merchant, not a public or high-volume path.
  const existing = await prisma.banditExperiment.findFirst({
    where: { organizationId, contentElementId, audienceId: input.audienceId, status: "RUNNING" },
  });
  if (existing) throw new DuplicateBanditExperimentError();

  const experiment = await prisma.banditExperiment.create({
    data: {
      organizationId,
      contentElementId,
      audienceId: input.audienceId,
      ruleAId: input.ruleAId,
      ruleBId: input.ruleBId,
    },
    include: { audience: { select: { name: true } } },
  });
  return toDTO(experiment);
}

export type BanditExperimentWithStatsDTO = BanditExperimentDTO & { armA: ArmStats; armB: ArmStats };

// Live-computed stats on every read, deliberately not the last value the
// daily cron happened to store — see computeArmStats's own comment: this
// is a cheap read over existing Impression/Conversion data, so there is no
// reason to show a merchant numbers that are up to a day stale when fresh
// ones cost nothing extra to the write path.
export async function listBanditExperiments(
  organizationId: string,
  contentElementId: string,
): Promise<{ experiments: BanditExperimentWithStatsDTO[]; visitorTrackingEnabled: boolean }> {
  const [experiments, element] = await Promise.all([
    prisma.banditExperiment.findMany({
      where: { organizationId, contentElementId },
      include: { audience: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contentElement.findFirst({
      where: { id: contentElementId, organizationId },
      select: { crawledPage: { select: { site: { select: { visitorTrackingEnabled: true } } } } },
    }),
  ]);

  const withStats = await Promise.all(
    experiments.map(async (experiment) => {
      const [armA, armB] = await Promise.all([
        computeArmStats(organizationId, experiment.ruleAId),
        computeArmStats(organizationId, experiment.ruleBId),
      ]);
      return { ...toDTO(experiment), armA, armB };
    }),
  );

  // Defaults to false (the honest "can't learn yet" state) for an
  // unknown/foreign elementId too — matching this list's own posture of
  // returning an empty array rather than 404ing, since it's a read scoped
  // by the org+element filter rather than a named-resource lookup.
  return { experiments: withStats, visitorTrackingEnabled: element?.crawledPage.site.visitorTrackingEnabled ?? false };
}

// Turns allocation off; does not touch either rule's own APPROVED status
// or content. resolve()'s normal deterministic tie-break governs from the
// next request onward, exactly as if this experiment had never run.
export async function stopBanditExperiment(organizationId: string, experimentId: string): Promise<BanditExperimentDTO> {
  const existing = await prisma.banditExperiment.findFirst({ where: { id: experimentId, organizationId } });
  if (!existing) throw new BanditExperimentNotFoundError();

  const experiment = await prisma.banditExperiment.update({
    where: { id: experimentId },
    data: { status: "STOPPED" },
    include: { audience: { select: { name: true } } },
  });
  return toDTO(experiment);
}
