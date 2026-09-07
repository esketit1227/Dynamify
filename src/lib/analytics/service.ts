import { prisma } from "@/lib/db";
import { twoProportionZTest, type SignificanceResult } from "@/lib/analytics/significance";
import type { SiteEventType } from "@/generated/prisma/client";

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
  // Real lead/sale counts and revenue (docs/roadmap.md — LEAD/SALE event
  // tracking) — a distinct conversion-goal signal the customer's own page
  // reports, separate from CTA_CLICK. Deliberately NOT wired into
  // causalLift/significance below yet: that comparison was built and
  // tested against CTA_CLICK specifically, and widening what it measures
  // is a real, separate decision, not a side effect of adding a new
  // event type.
  leads: number;
  personalizedLeads: number;
  sales: number;
  personalizedSales: number;
  // Sum of SiteEvent.value across SALE events only — null (not 0) when
  // no SALE event has ever included a value, same "no data yet" vs.
  // "genuinely zero" distinction the conversion rates below already make.
  // Stated limitation, not silently handled: this is a raw sum with no
  // currency conversion. It's only meaningful for a site that reports
  // every sale in one currency — the overwhelmingly common real case —
  // but a site that ever mixes currencies would get a number that adds
  // incompatible units together. SiteEvent.currency is captured correctly
  // per event either way; building a real per-currency (or converted)
  // rollup is separate, unstarted scope, not something to fake here.
  revenue: number | null;
  personalizedRevenue: number | null;
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
    leads: number;
    personalizedLeads: number;
    sales: number;
    personalizedSales: number;
    revenue: number | null;
    personalizedRevenue: number | null;
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
  leads: number;
  personalizedLeads: number;
  sales: number;
  personalizedSales: number;
  revenue: number;
  personalizedRevenue: number;
  // Tracks whether any SALE group's SUM(value) was ever non-null —
  // distinct from `sales > 0`, since a real sale can still omit a value.
  // SQL's SUM ignores nulls and returns null only when *every* row in the
  // group had one, so this is exactly "at least one reported sale
  // actually included an amount," per SALE-count row group.
  hasRevenue: boolean;
  hasPersonalizedRevenue: boolean;
};

function emptyBucket(): Bucket {
  return {
    pageViews: 0,
    personalizedPageViews: 0,
    holdoutPageViews: 0,
    ctaClicks: 0,
    personalizedCtaClicks: 0,
    holdoutCtaClicks: 0,
    leads: 0,
    personalizedLeads: 0,
    sales: 0,
    personalizedSales: 0,
    revenue: 0,
    personalizedRevenue: 0,
    hasRevenue: false,
    hasPersonalizedRevenue: false,
  };
}

// null when no SALE has ever actually included a value — distinct from a
// real total that happens to be 0. Deliberately NOT keyed off the sales
// *count*: a site can have real sales that all omitted an amount, which
// must still read as "no revenue data," not a false "$0."
function toRevenue(hasRevenue: boolean, revenue: number): number | null {
  return hasRevenue ? revenue : null;
}

type CountKey = "pageViews" | "ctaClicks" | "leads" | "sales";
// Every field `bucket[key] += row._count._all` can actually target — the
// numeric-count fields only, deliberately excluding revenue/hasRevenue*
// (summed separately, via row._sum, not row._count) so a keyof Bucket
// this broad can never be inferred where a plain count increment is
// expected.
type NumericCountKey = CountKey | `personalized${"PageViews" | "CtaClicks" | "Leads" | "Sales"}` | `holdout${"PageViews" | "CtaClicks"}`;
const COUNT_KEY_BY_TYPE: Record<SiteEventType, CountKey | undefined> = {
  PAGE_VIEW: "pageViews",
  CTA_CLICK: "ctaClicks",
  LEAD: "leads",
  SALE: "sales",
};
const PERSONALIZED_COUNT_KEY: Record<CountKey, NumericCountKey> = {
  pageViews: "personalizedPageViews",
  ctaClicks: "personalizedCtaClicks",
  leads: "personalizedLeads",
  sales: "personalizedSales",
};
const HOLDOUT_COUNT_KEY: Partial<Record<CountKey, NumericCountKey>> = {
  pageViews: "holdoutPageViews",
  ctaClicks: "holdoutCtaClicks",
};

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
      // Only ever meaningful for SALE rows (LEAD/PAGE_VIEW/CTA_CLICK never
      // set SiteEvent.value) — Prisma sums whatever's there regardless of
      // type, so this is scoped to SALE specifically down in the loop.
      _sum: { value: true },
    }),
  ]);

  const bySite = new Map<string, Bucket>();
  const org = emptyBucket();

  for (const row of counts) {
    const bucket = bySite.get(row.siteId) ?? emptyBucket();
    const countKey = COUNT_KEY_BY_TYPE[row.type];
    if (!countKey) continue; // no other SiteEventType exists today, but never assume

    // Held-out only ever applies to pageViews/ctaClicks today (the
    // causal-lift comparison this feeds is scoped to those, see the
    // comment on SiteAnalyticsRow.leads above) — a held-out visitor still
    // only ever experienced the generic version, so a LEAD/SALE from them
    // correctly falls through to the plain, non-personalized count below
    // rather than vanishing into a holdout bucket leads/sales doesn't
    // have. `personalized` is always false whenever `heldOut` is true
    // (src/lib/embed/service.ts), so this never double-counts either way.
    const holdoutKey = row.heldOut ? HOLDOUT_COUNT_KEY[countKey] : undefined;
    const key: NumericCountKey = holdoutKey ?? (row.personalized ? PERSONALIZED_COUNT_KEY[countKey] : countKey);

    bucket[key] += row._count._all;
    org[key] += row._count._all;

    if (row.type === "SALE" && row._sum.value !== null) {
      // Same reasoning as `key` above: `personalized` is already always
      // false whenever `heldOut` is true, so this needs no separate
      // holdout branch to be correct. Only enters this block at all when
      // at least one SALE in this group actually had a value — see
      // hasRevenue's own comment on the Bucket type.
      const revenueKey = row.personalized ? "personalizedRevenue" : "revenue";
      const hasRevenueKey = row.personalized ? "hasPersonalizedRevenue" : "hasRevenue";
      bucket[revenueKey] += row._sum.value;
      org[revenueKey] += row._sum.value;
      bucket[hasRevenueKey] = true;
      org[hasRevenueKey] = true;
    }

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
      leads: bucket.leads,
      personalizedLeads: bucket.personalizedLeads,
      sales: bucket.sales,
      personalizedSales: bucket.personalizedSales,
      revenue: toRevenue(bucket.hasRevenue, bucket.revenue),
      personalizedRevenue: toRevenue(bucket.hasPersonalizedRevenue, bucket.personalizedRevenue),
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
      leads: org.leads,
      personalizedLeads: org.personalizedLeads,
      sales: org.sales,
      personalizedSales: org.personalizedSales,
      revenue: toRevenue(org.hasRevenue, org.revenue),
      personalizedRevenue: toRevenue(org.hasPersonalizedRevenue, org.personalizedRevenue),
    },
    genericConversionRate: conversionRate(org.ctaClicks, org.pageViews),
    personalizedConversionRate: conversionRate(org.personalizedCtaClicks, org.personalizedPageViews),
    causalLift: causalLiftFromBucket(orgCausal, anyHoldoutEnabled),
    perSite,
  };
}
