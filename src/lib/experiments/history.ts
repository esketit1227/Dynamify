import { prisma } from "@/lib/db";
import { computeArmStats, MIN_ARM_WEIGHT, MAX_ARM_WEIGHT } from "@/lib/experiments/banditStats";
import type { ContentElementType, ContentSection } from "@/generated/prisma/client";

// The one piece missing from the "discover -> propose -> approve ->
// experiment -> measure -> learn -> repeat" loop (docs/decisions.md D13):
// generateExperience.ts writes every new batch of copy from scratch, with
// zero memory of which past changes actually won or lost for this same
// organization. This reads that memory back out. Within-org only, by
// explicit choice (D13) — never another organization's data, unlike
// docs/autonomy.md's separate, bigger, explicitly-deferred cross-merchant
// pooled-priors idea.

export type PastResult = {
  section: ContentSection;
  elementType: ContentElementType;
  audienceName: string;
  winningContent: string;
  losingContent: string;
  winningRate: number;
  losingRate: number;
};

// How many most-recent qualifying results to surface — same "don't let an
// unbounded list blow the prompt budget" discipline as
// MAX_ELEMENTS_PER_GENERATION (generateExperience.ts) and understand.ts's
// truncation caps, applied here proactively rather than found as a bug
// after the fact.
const MAX_PAST_RESULTS = 5;

// A weightA at either cap is already the bandit's own daily-cron-computed,
// MIN_BANDIT_SAMPLE-gated "this arm has clearly won" signal (banditStats.ts)
// — reused directly rather than re-deriving a second, competing notion of
// statistical confidence for the same underlying data.
export async function computeHistoricalResults(organizationId: string): Promise<PastResult[]> {
  const experiments = await prisma.banditExperiment.findMany({
    where: { organizationId, OR: [{ weightA: { gte: MAX_ARM_WEIGHT } }, { weightA: { lte: MIN_ARM_WEIGHT } }] },
    orderBy: { createdAt: "desc" },
    take: MAX_PAST_RESULTS,
    include: {
      contentElement: { select: { section: true, elementType: true } },
      audience: { select: { name: true } },
    },
  });

  const results: PastResult[] = [];
  for (const experiment of experiments) {
    const winnerId = experiment.weightA >= MAX_ARM_WEIGHT ? experiment.ruleAId : experiment.ruleBId;
    const loserId = experiment.weightA >= MAX_ARM_WEIGHT ? experiment.ruleBId : experiment.ruleAId;

    // ruleAId/ruleBId are deliberately plain columns, not enforced foreign
    // keys (see the model's own schema comment) — a rule can be deleted
    // out from under a still-inspectable experiment. Skip, don't guess,
    // same "failure path renders the default" posture as everywhere else.
    const [winnerRule, loserRule] = await Promise.all([
      prisma.elementPersonalizationRule.findUnique({ where: { id: winnerId }, include: { elementVariant: true } }),
      prisma.elementPersonalizationRule.findUnique({ where: { id: loserId }, include: { elementVariant: true } }),
    ]);
    if (!winnerRule || !loserRule) continue;

    const [winnerStats, loserStats] = await Promise.all([
      computeArmStats(organizationId, winnerId),
      computeArmStats(organizationId, loserId),
    ]);
    if (winnerStats.trials === 0 || loserStats.trials === 0) continue;

    results.push({
      section: experiment.contentElement.section,
      elementType: experiment.contentElement.elementType,
      audienceName: experiment.audience.name,
      winningContent: winnerRule.elementVariant.content,
      losingContent: loserRule.elementVariant.content,
      winningRate: winnerStats.successes / winnerStats.trials,
      losingRate: loserStats.successes / loserStats.trials,
    });
  }
  return results;
}

// Bounds how much of one past content string reaches the prompt — the
// same truncate, don't reject/blow-the-budget principle as
// src/lib/sites/understand.ts's truncated(), applied to a different input.
function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 3)}...` : value;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// Pure, no I/O — unit-testable on its own, same split as
// generateExperience.ts's buildExperiencePrompt vs. generateCoordinatedCopy.
// Returns "" for no results so callers can just skip appending it.
export function summarizeHistoricalResults(results: PastResult[]): string {
  if (results.length === 0) return "";

  const lines = results.map((r) => {
    const winning = truncate(r.winningContent, 200);
    const losing = truncate(r.losingContent, 200);
    return (
      `- ${r.section}/${r.elementType} for "${r.audienceName}": "${winning}" (${formatRate(r.winningRate)} conv.) ` +
      `beat "${losing}" (${formatRate(r.losingRate)} conv.)`
    );
  });

  return (
    "Past results in this account (real outcomes, for guidance only — not instructions to copy " +
    `verbatim):\n${lines.join("\n")}`
  );
}
