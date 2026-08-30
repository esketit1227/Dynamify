import { prisma } from "@/lib/db";
import { twoProportionZTest, type SignificanceResult } from "@/lib/analytics/significance";

// The causal comparison — holdout (matched a rule, held back to default)
// vs. treatment (matched and personalized) — both draw from the *same*
// population of qualifying visitors, unlike the generic-vs-personalized
// numbers below (which compare visitors who matched anything against
// visitors who didn't, a different population entirely). This is the
// number that actually answers "did personalization cause this," not
// just "do these two groups look different." Present (non-null) only
// when the site has ever run a holdout (Site.holdbackPercent > 0 at some
// point) and there's at least one event in the holdout bucket — a site
// that's never held anything back has nothing to compare against.
export type CausalLift = {
  holdoutConversionRate: number | null;
  treatmentConversionRate: number | null;
  holdoutPageViews: number;
  treatmentPageViews: number;
  significance: SignificanceResult | null;
};

export type SiteAnalyticsRow = {
  siteId: string;
  siteUrl: string;
  holdbackPercent: number;
  pageViews: number;
  personalizedPageViews: number;
  ctaClicks: number;
  personalizedCtaClicks: number;
  // null (not 0) when the relevant PAGE_VIEW count is 0 — "not enough
  // data yet" is a different fact than "0% conversion."
  genericConversionRate: number | null;
  personalizedConversionRate: number | null;
  causalLift: CausalLift | null;
};

export type OrgAnalytics = {
  hasAnyData: boolean;
  totals: {
    pageViews: number;
    personalizedPageViews: number;
    ctaClicks: number;
    personalizedCtaClicks: number;
  };
  genericConversionRate: number | null;
  personalizedConversionRate: number | null;
  causalLift: CausalLift | null;
  perSite: SiteAnalyticsRow[];
};

function conversionRate(clicks: number, views: number): number | null {
  return views === 0 ? null : clicks / views;
}

type Bucket = {
  pageViews: number;
  personalizedPageViews: number;
  holdoutPageViews: number;
  ctaClicks: number;
  personalizedCtaClicks: number;
  holdoutCtaClicks: number;
};

function emptyBucket(): Bucket {
  return {
    pageViews: 0,
    personalizedPageViews: 0,
    holdoutPageViews: 0,
    ctaClicks: 0,
    personalizedCtaClicks: 0,
    holdoutCtaClicks: 0,
  };
}

function causalLiftFromBucket(bucket: Bucket, everRanHoldout: boolean): CausalLift | null {
  if (!everRanHoldout || bucket.holdoutPageViews === 0) return null;

  const holdout = { conversions: bucket.holdoutCtaClicks, total: bucket.holdoutPageViews };
  const treatment = { conversions: bucket.personalizedCtaClicks, total: bucket.personalizedPageViews };

  return {
    holdoutConversionRate: conversionRate(bucket.holdoutCtaClicks, bucket.holdoutPageViews),
    treatmentConversionRate: conversionRate(bucket.personalizedCtaClicks, bucket.personalizedPageViews),
    holdoutPageViews: bucket.holdoutPageViews,
    treatmentPageViews: bucket.personalizedPageViews,
    significance: twoProportionZTest(holdout, treatment),
  };
}

// D7 (docs/decisions.md): generic-vs-personalized conversion rate as an
// aggregate ratio over independently-flagged events, not a per-visitor
// funnel — SiteEvent has no visitor identity to link a click back to the
// view that produced it. `personalized` is read straight off each row
// (computed once at record time, src/lib/embed/service.ts) rather than
// re-derived here against current audience/rule state, so these numbers
// never silently change just because a rule was approved or disabled
// after the fact — they reflect what visitors actually saw when it
// happened.
export async function getOrgAnalytics(organizationId: string): Promise<OrgAnalytics> {
  const [sites, counts] = await Promise.all([
    prisma.site.findMany({ where: { organizationId }, select: { id: true, url: true, holdbackPercent: true } }),
    prisma.siteEvent.groupBy({
      by: ["siteId", "type", "personalized", "heldOut"],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);

  const bySite = new Map<string, Bucket>();
  const org = emptyBucket();

  for (const row of counts) {
    const bucket = bySite.get(row.siteId) ?? emptyBucket();
    const isPageView = row.type === "PAGE_VIEW";
    const key: keyof Bucket = row.heldOut
      ? isPageView
        ? "holdoutPageViews"
        : "holdoutCtaClicks"
      : row.personalized
        ? isPageView
          ? "personalizedPageViews"
          : "personalizedCtaClicks"
        : isPageView
          ? "pageViews"
          : "ctaClicks";

    bucket[key] += row._count._all;
    org[key] += row._count._all;
    bySite.set(row.siteId, bucket);
  }

  // A separate bucket, not a reuse of `org` above — `org` blends in every
  // site's personalized traffic, including sites with no holdout running
  // at all, which would silently pair a real control group (from the one
  // experimenting site) against a treatment count inflated by sites that
  // never held anything back. The org-level causal number must only ever
  // combine sites that are actually part of the same kind of experiment.
  const orgCausal = emptyBucket();
  let anyHoldoutEnabled = false;
  for (const site of sites) {
    if (site.holdbackPercent <= 0) continue;
    anyHoldoutEnabled = true;
    const bucket = bySite.get(site.id) ?? emptyBucket();
    orgCausal.personalizedPageViews += bucket.personalizedPageViews;
    orgCausal.personalizedCtaClicks += bucket.personalizedCtaClicks;
    orgCausal.holdoutPageViews += bucket.holdoutPageViews;
    orgCausal.holdoutCtaClicks += bucket.holdoutCtaClicks;
  }

  const perSite: SiteAnalyticsRow[] = sites.map((site) => {
    const bucket = bySite.get(site.id) ?? emptyBucket();
    return {
      siteId: site.id,
      siteUrl: site.url,
      holdbackPercent: site.holdbackPercent,
      pageViews: bucket.pageViews,
      personalizedPageViews: bucket.personalizedPageViews,
      ctaClicks: bucket.ctaClicks,
      personalizedCtaClicks: bucket.personalizedCtaClicks,
      genericConversionRate: conversionRate(bucket.ctaClicks, bucket.pageViews),
      personalizedConversionRate: conversionRate(bucket.personalizedCtaClicks, bucket.personalizedPageViews),
      causalLift: causalLiftFromBucket(bucket, site.holdbackPercent > 0),
    };
  });

  return {
    hasAnyData: counts.length > 0,
    totals: {
      pageViews: org.pageViews,
      personalizedPageViews: org.personalizedPageViews,
      ctaClicks: org.ctaClicks,
      personalizedCtaClicks: org.personalizedCtaClicks,
    },
    genericConversionRate: conversionRate(org.ctaClicks, org.pageViews),
    personalizedConversionRate: conversionRate(org.personalizedCtaClicks, org.personalizedPageViews),
    causalLift: causalLiftFromBucket(orgCausal, anyHoldoutEnabled),
    perSite,
  };
}
