import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getEmbedElements, recordSiteEvent, type ConsentState } from "@/lib/embed/service";
import {
  selectBanditArm,
  runBanditWeightUpdates,
  createBanditExperiment,
  listBanditExperiments,
  stopBanditExperiment,
  ContentElementNotFoundError,
  BanditAudienceNotFoundError,
  BanditExperimentNotFoundError,
  DuplicateBanditExperimentError,
} from "@/lib/experiments/bandit";
import { MIN_BANDIT_SAMPLE, MAX_ARM_WEIGHT } from "@/lib/experiments/banditStats";
import { computeHistoricalResults } from "@/lib/experiments/history";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";

afterEach(async () => {
  await resetDb();
});

const TRACKED_CONSENT: ConsentState = { necessary: true, analytics: true, personalization: true };

async function seedTrackedSite(organizationId: string) {
  const site = await prisma.site.create({
    data: { organizationId, url: "https://example.com", status: "READY", visitorTrackingEnabled: true },
  });
  const page = await prisma.crawledPage.create({
    data: { siteId: site.id, organizationId, url: "https://example.com/" },
  });
  const element = await prisma.contentElement.create({
    data: {
      crawledPageId: page.id,
      organizationId,
      section: "HERO",
      elementType: "HEADLINE",
      selector: "h1",
      currentContent: "Default headline",
      order: 0,
    },
  });
  return { site, page, element };
}

// Two already-APPROVED rules sharing one (element, audience) slot — the
// exact shape a bandit experiment contests. Without an experiment
// running, resolve()'s own tie-break already picks a single winner
// between these two every time; the point of every test below is
// confirming that winner can now be a real, deterministic per-visitor
// split instead.
async function seedTwoArmRules(organizationId: string, elementId: string, contentA: string, contentB: string) {
  const audience = await prisma.audience.create({
    data: {
      organizationId,
      name: "Mobile visitors",
      rules: { create: [{ organizationId, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
    },
  });
  const variantA = await prisma.elementVariant.create({
    data: { organizationId, contentElementId: elementId, content: contentA, method: "MANUAL" },
  });
  const variantB = await prisma.elementVariant.create({
    data: { organizationId, contentElementId: elementId, content: contentB, method: "MANUAL" },
  });
  const ruleA = await prisma.elementPersonalizationRule.create({
    data: { organizationId, contentElementId: elementId, audienceId: audience.id, elementVariantId: variantA.id, priority: 0, status: "APPROVED" },
  });
  const ruleB = await prisma.elementPersonalizationRule.create({
    data: { organizationId, contentElementId: elementId, audienceId: audience.id, elementVariantId: variantB.id, priority: 0, status: "APPROVED" },
  });
  return { audience, ruleA, ruleB, variantA, variantB };
}

// Seeds the raw Impression/(SiteEvent+Conversion) rows computeArmStats
// reads — directly, not through recordSiteEvent — so a specific trial
// count and conversion outcome can be dictated exactly, the same way
// autoOptimize.test.ts's seedPageViews seeds volume directly rather than
// driving the full request pipeline for every row.
async function seedTrial(
  organizationId: string,
  siteId: string,
  crawledPageId: string,
  audienceId: string,
  ruleId: string,
  elementVariantId: string,
  visitorKey: string,
  converted: boolean,
) {
  const visitor = await prisma.siteVisitor.create({ data: { organizationId, siteId, visitorKey } });
  const session = await prisma.visitorSession.create({ data: { organizationId, visitorId: visitor.id } });
  await prisma.impression.create({
    data: { organizationId, sessionId: session.id, crawledPageId, audienceId, ruleId, elementVariantId },
  });
  if (converted) {
    const siteEvent = await prisma.siteEvent.create({
      data: { organizationId, siteId, crawledPageId, type: "LEAD", personalized: true, context: {} },
    });
    await prisma.conversion.create({ data: { organizationId, sessionId: session.id, siteEventId: siteEvent.id } });
  }
}

// docs/decisions.md D11 / the approved plan's Step 4: applyBanditFiltering
// wired into both getEmbedElements and recordSiteEvent, never touching
// resolve() itself.
describe("applyBanditFiltering", () => {
  it("shows only arm A's content when weightA=1, for a tracked+consenting visitor", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 1 },
    });

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "mobile" },
      undefined,
      "visitor-1",
      undefined,
      TRACKED_CONSENT,
    );
    expect(elements[0].personalizedContent).toBe("Variant A");
  });

  it("shows only arm B's content when weightA=0", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 0 },
    });

    const { elements } = await getEmbedElements(
      site.id,
      "https://example.com",
      { device: "mobile" },
      undefined,
      "visitor-1",
      undefined,
      TRACKED_CONSENT,
    );
    expect(elements[0].personalizedContent).toBe("Variant B");
  });

  it("assigns each tracked visitor to the same arm selectBanditArm itself would compute", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 0.5 },
    });

    for (const visitorKey of ["visitor-1", "visitor-2", "visitor-3", "visitor-4"]) {
      const expectedArm = selectBanditArm(experiment.id, visitorKey, 0.5);
      const { elements } = await getEmbedElements(
        site.id,
        "https://example.com",
        { device: "mobile" },
        undefined,
        visitorKey,
        undefined,
        TRACKED_CONSENT,
      );
      expect(elements[0].personalizedContent).toBe(expectedArm === "A" ? "Variant A" : "Variant B");
    }
  });

  it("leaves an untracked visitor's result completely unaffected by the experiment", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 0.999 },
    });

    // No visitorKey at all — resolve() sees both rules and picks its own
    // single deterministic winner, which must not move even if weightA
    // swings from one extreme to the other.
    const first = await getEmbedElements(site.id, "https://example.com", { device: "mobile" });
    await prisma.banditExperiment.updateMany({ where: { contentElementId: element.id }, data: { weightA: 0.001 } });
    const second = await getEmbedElements(site.id, "https://example.com", { device: "mobile" });

    expect(first.elements[0].personalizedContent).toBeDefined();
    expect(first.elements[0].personalizedContent).toBe(second.elements[0].personalizedContent);
  });

  it("recordSiteEvent writes a real Impression against whichever arm's rule the visitor was assigned", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 0.5 },
    });

    const visitorKey = "visitor-99";
    const expectedArm = selectBanditArm(experiment.id, visitorKey, 0.5);
    const expectedRuleId = expectedArm === "A" ? ruleA.id : ruleB.id;

    await recordSiteEvent(site.id, "https://example.com", { device: "mobile" }, undefined, undefined, visitorKey, undefined, TRACKED_CONSENT);

    const impression = await prisma.impression.findFirstOrThrow({ where: { organizationId: organization.id } });
    expect(impression.ruleId).toBe(expectedRuleId);
  });

  it("reverts to resolve()'s single deterministic winner once the experiment is stopped", async () => {
    const { organization } = await createOrgWithUser();
    const { site, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 0.5 },
    });

    const candidates = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"];
    const visitorA = candidates.find((k) => selectBanditArm(experiment.id, k, 0.5) === "A")!;
    const visitorB = candidates.find((k) => selectBanditArm(experiment.id, k, 0.5) === "B")!;

    const beforeA = await getEmbedElements(site.id, "https://example.com", { device: "mobile" }, undefined, visitorA, undefined, TRACKED_CONSENT);
    const beforeB = await getEmbedElements(site.id, "https://example.com", { device: "mobile" }, undefined, visitorB, undefined, TRACKED_CONSENT);
    expect(beforeA.elements[0].personalizedContent).not.toBe(beforeB.elements[0].personalizedContent);

    await stopBanditExperiment(organization.id, experiment.id);

    const afterA = await getEmbedElements(site.id, "https://example.com", { device: "mobile" }, undefined, visitorA, undefined, TRACKED_CONSENT);
    const afterB = await getEmbedElements(site.id, "https://example.com", { device: "mobile" }, undefined, visitorB, undefined, TRACKED_CONSENT);
    expect(afterA.elements[0].personalizedContent).toBe(afterB.elements[0].personalizedContent);
  });
});

describe("runBanditWeightUpdates", () => {
  it("stays at exactly 0.5 below MIN_BANDIT_SAMPLE, no matter how lopsided the outcomes are", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB, variantA, variantB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id },
    });

    for (let i = 0; i < 6; i++) {
      await seedTrial(organization.id, site.id, page.id, audience.id, ruleA.id, variantA.id, `a-${i}`, true);
      await seedTrial(organization.id, site.id, page.id, audience.id, ruleB.id, variantB.id, `b-${i}`, false);
    }

    const result = await runBanditWeightUpdates();
    expect(result.updated).toBe(1);
    const updated = await prisma.banditExperiment.findUniqueOrThrow({ where: { id: experiment.id } });
    expect(updated.weightA).toBe(0.5);
  });

  it("shifts weightA toward the arm with the real, seeded higher conversion rate once both clear MIN_BANDIT_SAMPLE", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB, variantA, variantB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id },
    });

    const TRIALS = MIN_BANDIT_SAMPLE + 10; // comfortably over the threshold
    for (let i = 0; i < TRIALS; i++) {
      await seedTrial(organization.id, site.id, page.id, audience.id, ruleA.id, variantA.id, `a-${i}`, i < TRIALS * 0.8); // ~80% convert
      await seedTrial(organization.id, site.id, page.id, audience.id, ruleB.id, variantB.id, `b-${i}`, i < TRIALS * 0.1); // ~10% convert
    }

    const result = await runBanditWeightUpdates();
    expect(result.updated).toBe(1);
    const updated = await prisma.banditExperiment.findUniqueOrThrow({ where: { id: experiment.id } });
    expect(updated.weightA).toBeGreaterThan(0.7);
    expect(updated.weightA).toBeLessThanOrEqual(0.9); // never fully starves arm B
  });

  it("never updates a STOPPED experiment", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, status: "STOPPED", weightA: 0.5 },
    });

    const result = await runBanditWeightUpdates();
    expect(result.updated).toBe(0);
    const unchanged = await prisma.banditExperiment.findUniqueOrThrow({ where: { id: experiment.id } });
    expect(unchanged.weightA).toBe(0.5);
  });
});

describe("createBanditExperiment", () => {
  it("creates a RUNNING experiment for two valid, approved, same-audience rules", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");

    const experiment = await createBanditExperiment(organization.id, element.id, {
      audienceId: audience.id,
      ruleAId: ruleA.id,
      ruleBId: ruleB.id,
    });

    expect(experiment).toMatchObject({
      contentElementId: element.id,
      audienceId: audience.id,
      audienceName: "Mobile visitors",
      ruleAId: ruleA.id,
      ruleBId: ruleB.id,
      weightA: 0.5,
      status: "RUNNING",
    });
  });

  it("rejects a nonexistent content element", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");

    await expect(
      createBanditExperiment(organization.id, "not-a-real-element", { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id }),
    ).rejects.toThrow(ContentElementNotFoundError);
  });

  it("never lets one org create an experiment using another org's audience", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { element: elementA } = await seedTrackedSite(orgA.id);
    const { element: elementB } = await seedTrackedSite(orgB.id);
    const { audience: audienceB, ruleA: ruleB1, ruleB: ruleB2 } = await seedTwoArmRules(orgB.id, elementB.id, "A", "B");

    await expect(
      createBanditExperiment(orgA.id, elementA.id, { audienceId: audienceB.id, ruleAId: ruleB1.id, ruleBId: ruleB2.id }),
    ).rejects.toThrow(BanditAudienceNotFoundError);
  });

  it("rejects the same rule used for both arms", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");

    await expect(
      createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleA.id }),
    ).rejects.toThrow(/different rules/);
  });

  it("rejects a rule that belongs to a different audience", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const otherAudience = await prisma.audience.create({ data: { organizationId: organization.id, name: "Desktop visitors" } });
    const otherVariant = await prisma.elementVariant.create({
      data: { organizationId: organization.id, contentElementId: element.id, content: "Other", method: "MANUAL" },
    });
    const otherRule = await prisma.elementPersonalizationRule.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: otherAudience.id, elementVariantId: otherVariant.id, priority: 0, status: "APPROVED" },
    });

    await expect(
      createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: otherRule.id }),
    ).rejects.toThrow(/target the audience/);
  });

  it("rejects a rule that isn't APPROVED yet", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const audience = await prisma.audience.create({
      data: {
        organizationId: organization.id,
        name: "Mobile visitors",
        rules: { create: [{ organizationId: organization.id, field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
      },
    });
    const variantA = await prisma.elementVariant.create({ data: { organizationId: organization.id, contentElementId: element.id, content: "A", method: "MANUAL" } });
    const variantB = await prisma.elementVariant.create({ data: { organizationId: organization.id, contentElementId: element.id, content: "B", method: "MANUAL" } });
    const ruleA = await prisma.elementPersonalizationRule.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, elementVariantId: variantA.id, priority: 0, status: "APPROVED" },
    });
    const rulePending = await prisma.elementPersonalizationRule.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, elementVariantId: variantB.id, priority: 0 },
    });

    await expect(
      createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: rulePending.id }),
    ).rejects.toThrow(/must be approved/);
  });

  it("rejects a duplicate RUNNING experiment for the same element+audience", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    await createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id });

    const variantC = await prisma.elementVariant.create({ data: { organizationId: organization.id, contentElementId: element.id, content: "C", method: "MANUAL" } });
    const ruleC = await prisma.elementPersonalizationRule.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, elementVariantId: variantC.id, priority: 0, status: "APPROVED" },
    });

    await expect(
      createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleC.id }),
    ).rejects.toThrow(DuplicateBanditExperimentError);
  });

  it("allows a new experiment for the same slot once the previous one is stopped", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const first = await createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id });
    await stopBanditExperiment(organization.id, first.id);

    const variantC = await prisma.elementVariant.create({ data: { organizationId: organization.id, contentElementId: element.id, content: "C", method: "MANUAL" } });
    const ruleC = await prisma.elementPersonalizationRule.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, elementVariantId: variantC.id, priority: 0, status: "APPROVED" },
    });

    const second = await createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleC.id });
    expect(second.status).toBe("RUNNING");
  });
});

describe("listBanditExperiments", () => {
  it("returns live-computed stats for both arms alongside the stored weight", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB, variantA, variantB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    await createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id });

    await seedTrial(organization.id, site.id, page.id, audience.id, ruleA.id, variantA.id, "a-1", true);
    await seedTrial(organization.id, site.id, page.id, audience.id, ruleB.id, variantB.id, "b-1", false);

    const { experiments, visitorTrackingEnabled } = await listBanditExperiments(organization.id, element.id);
    expect(visitorTrackingEnabled).toBe(true);
    expect(experiments).toHaveLength(1);
    expect(experiments[0].armA).toEqual({ trials: 1, successes: 1 });
    expect(experiments[0].armB).toEqual({ trials: 1, successes: 0 });
  });

  it("reports visitorTrackingEnabled: false for a site that hasn't turned tracking on", async () => {
    const { organization } = await createOrgWithUser();
    const site = await prisma.site.create({ data: { organizationId: organization.id, url: "https://example.com", status: "READY" } });
    const page = await prisma.crawledPage.create({ data: { siteId: site.id, organizationId: organization.id, url: "https://example.com/" } });
    const element = await prisma.contentElement.create({
      data: { crawledPageId: page.id, organizationId: organization.id, section: "HERO", elementType: "HEADLINE", selector: "h1", currentContent: "x", order: 0 },
    });

    const { experiments, visitorTrackingEnabled } = await listBanditExperiments(organization.id, element.id);
    expect(experiments).toEqual([]);
    expect(visitorTrackingEnabled).toBe(false);
  });
});

describe("stopBanditExperiment", () => {
  it("sets status to STOPPED", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "Variant A", "Variant B");
    const experiment = await createBanditExperiment(organization.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id });

    const stopped = await stopBanditExperiment(organization.id, experiment.id);
    expect(stopped.status).toBe("STOPPED");
  });

  it("404s for another org's experiment", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { element } = await seedTrackedSite(orgA.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(orgA.id, element.id, "Variant A", "Variant B");
    const experiment = await createBanditExperiment(orgA.id, element.id, { audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id });

    await expect(stopBanditExperiment(orgB.id, experiment.id)).rejects.toThrow(BanditExperimentNotFoundError);
  });
});

// docs/decisions.md D13: recommendations should factor in this org's own
// past bandit results. weightA at the cap is already the bandit's own
// "this arm clearly won" signal (banditStats.ts) — reused directly rather
// than a second, competing notion of significance.
describe("computeHistoricalResults", () => {
  it("surfaces a converged experiment, with the correct winner/loser and real rates", async () => {
    const { organization } = await createOrgWithUser();
    const { site, page, element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB, variantA, variantB } = await seedTwoArmRules(
      organization.id,
      element.id,
      "Winning headline",
      "Losing headline",
    );
    await prisma.banditExperiment.create({
      data: {
        organizationId: organization.id,
        contentElementId: element.id,
        audienceId: audience.id,
        ruleAId: ruleA.id,
        ruleBId: ruleB.id,
        weightA: MAX_ARM_WEIGHT,
      },
    });
    for (let i = 0; i < 6; i++) {
      await seedTrial(organization.id, site.id, page.id, audience.id, ruleA.id, variantA.id, `a-${i}`, i < 3);
    }
    for (let i = 0; i < 6; i++) {
      await seedTrial(organization.id, site.id, page.id, audience.id, ruleB.id, variantB.id, `b-${i}`, i < 1);
    }

    const results = await computeHistoricalResults(organization.id);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      section: "HERO",
      elementType: "HEADLINE",
      audienceName: "Mobile visitors",
      winningContent: "Winning headline",
      losingContent: "Losing headline",
      winningRate: 0.5,
      losingRate: 1 / 6,
    });
  });

  it("excludes an experiment that hasn't converged (weightA still near 0.5)", async () => {
    const { organization } = await createOrgWithUser();
    const { element } = await seedTrackedSite(organization.id);
    const { audience, ruleA, ruleB } = await seedTwoArmRules(organization.id, element.id, "A", "B");
    await prisma.banditExperiment.create({
      data: { organizationId: organization.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: 0.5 },
    });

    expect(await computeHistoricalResults(organization.id)).toEqual([]);
  });

  it("never surfaces another organization's experiment", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const { site, page, element } = await seedTrackedSite(orgB.id);
    const { audience, ruleA, ruleB, variantA, variantB } = await seedTwoArmRules(orgB.id, element.id, "A", "B");
    await prisma.banditExperiment.create({
      data: { organizationId: orgB.id, contentElementId: element.id, audienceId: audience.id, ruleAId: ruleA.id, ruleBId: ruleB.id, weightA: MAX_ARM_WEIGHT },
    });
    await seedTrial(orgB.id, site.id, page.id, audience.id, ruleA.id, variantA.id, "a-1", true);
    await seedTrial(orgB.id, site.id, page.id, audience.id, ruleB.id, variantB.id, "b-1", false);

    expect(await computeHistoricalResults(orgA.id)).toEqual([]);
  });
});
