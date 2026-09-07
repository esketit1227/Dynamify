import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, MousePointerClick } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getOverviewStats } from "@/lib/overview/service";
import { getOrgAnalytics } from "@/lib/analytics/service";
import { confidenceLabel } from "@/lib/analytics/significance";
import { listPendingExperiences, countPendingExperiences } from "@/lib/sites/generateExperience";
import { PageHeader } from "@/components/dashboard/page-header";
import { HeroStatCard } from "@/components/dashboard/hero-stat-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { FeaturedSiteCard } from "@/components/dashboard/featured-site-card";
import { PendingExperiencesFeed } from "@/components/dashboard/pending-experiences-feed";
import { BarChart } from "@/components/charts/bar-chart";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { DemoLauncher } from "@/components/demo/demo-launcher";

function formatRate(rate: number | null): string {
  return rate === null ? "not enough data" : `${(rate * 100).toFixed(1)}%`;
}

// Rounded to one decimal place of a percent (e.g. 28.2) — BarChart shows
// this number as-is above each bar, so it needs to already be in the unit
// the label communicates, not a raw 0-1 ratio.
function ratePercent(rate: number | null): number {
  return rate === null ? 0 : Math.round(rate * 1000) / 10;
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const stats = await getOverviewStats(organization.id);

  if (stats.siteCount === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.name ?? user.email}`} />
        <EmptyState
          title="Connect your first website"
          description="Dynamify reads your existing site, understands what it sells and who it's for, and personalizes it for different visitors. Nothing changes on your live site until you say so."
          action={
            <div className="flex gap-2">
              <DemoLauncher organizationId={organization.id} />
              <Link href="/sites">
                <Button variant="secondary">Connect a website</Button>
              </Link>
            </div>
          }
        />
      </>
    );
  }

  const [analytics, pendingExperiences, pendingExperiencesTotal] = await Promise.all([
    getOrgAnalytics(organization.id),
    listPendingExperiences(organization.id, { take: 3 }),
    countPendingExperiences(organization.id),
  ]);

  // Relative improvement only means something against a non-zero default
  // rate — some views but zero default clicks makes the ratio undefined,
  // not "infinitely better."
  const relativeImprovement =
    analytics.genericConversionRate !== null &&
    analytics.genericConversionRate > 0 &&
    analytics.personalizedConversionRate !== null
      ? ((analytics.personalizedConversionRate - analytics.genericConversionRate) / analytics.genericConversionRate) *
        100
      : null;

  // docs/launch-plan.md §5E — "+41% conversion, 97% confidence" is the
  // number this product exists to produce, but it was previously buried as
  // a caption sentence below a weaker, merely-correlational headline
  // number (relativeImprovement above, which compares visitors who
  // matched a rule against visitors who didn't — different populations,
  // not a controlled comparison; see D7 in docs/decisions.md). The causal
  // number — the *same* population, split by a real holdout coin flip —
  // is what actually backs a claim like this, so it's what leads once it
  // exists. Same formula CausalLiftCard already uses (src/app/(dashboard)/
  // analytics/page.tsx) — not recomputed differently in two places by
  // accident, just not extracted into a shared helper for one call site
  // each.
  const significance = analytics.causalLift?.significance ?? null;
  const causalLiftPercent =
    analytics.causalLift?.holdoutConversionRate !== null &&
    analytics.causalLift?.holdoutConversionRate !== undefined &&
    analytics.causalLift.holdoutConversionRate > 0 &&
    analytics.causalLift?.treatmentConversionRate !== null &&
    analytics.causalLift?.treatmentConversionRate !== undefined
      ? ((analytics.causalLift.treatmentConversionRate - analytics.causalLift.holdoutConversionRate) /
          analytics.causalLift.holdoutConversionRate) *
        100
      : null;
  const hasVerifiedLift = significance?.significant && significance.direction === "higher" && causalLiftPercent !== null;
  const isUnderperforming = significance?.significant && significance.direction === "lower";

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name ?? user.email}`}
        description={`${organization.name} has ${stats.siteCount} connected ${stats.siteCount === 1 ? "site" : "sites"}.`}
        action={
          <Link href="/sites">
            <Button variant="secondary">Connect a website</Button>
          </Link>
        }
      />

      <PendingExperiencesFeed
        organizationId={organization.id}
        initialExperiences={pendingExperiences}
        totalCount={pendingExperiencesTotal}
      />

      {!analytics.hasAnyData ? (
        <EmptyState
          title="No performance data yet"
          description="Once a connected site's embed script is installed and collecting real visits, performance and personalization-lift numbers will show up here."
          action={
            <Link href="/sites" className="text-sm font-medium text-foreground underline underline-offset-2">
              Go to Sites
            </Link>
          }
        />
      ) : (
        <>
          {isUnderperforming ? (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-4">
              <p className="text-sm font-medium text-danger">
                Personalization is significantly underperforming the default ({confidenceLabel(significance!.pValue)}{" "}
                confidence) — worth reviewing your active rules.
              </p>
              <Link href="/analytics" className="mt-1 inline-block text-xs font-medium text-danger underline underline-offset-2">
                See the holdout comparison
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {hasVerifiedLift ? (
              <HeroStatCard
                label="Verified personalization lift"
                value={`${causalLiftPercent! >= 0 ? "+" : ""}${causalLiftPercent!.toFixed(0)}%`}
                caption={`${confidenceLabel(significance!.pValue)} confidence — a real holdout test, not just correlation`}
              />
            ) : (
              <HeroStatCard
                label="Personalization lift"
                value={
                  relativeImprovement !== null
                    ? `${relativeImprovement >= 0 ? "+" : ""}${relativeImprovement.toFixed(0)}%`
                    : "Not enough data yet"
                }
                caption="Personalized vs. default conversion rate — turn on a holdout test on a site for a verified number"
              />
            )}
            <StatCard
              label="Page views"
              value={analytics.totals.pageViews.toLocaleString()}
              caption={`${analytics.totals.personalizedPageViews.toLocaleString()} personalized`}
              icon={Eye}
            />
            <StatCard
              label="CTA clicks"
              value={analytics.totals.ctaClicks.toLocaleString()}
              caption={`${analytics.totals.personalizedCtaClicks.toLocaleString()} personalized`}
              icon={MousePointerClick}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Default vs. personalized</p>
                <Link
                  href="/analytics"
                  className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
                >
                  Full breakdown
                </Link>
              </div>
              <BarChart
                points={[
                  { label: "Default", value: ratePercent(analytics.genericConversionRate) },
                  { label: "Personalized", value: ratePercent(analytics.personalizedConversionRate) },
                ]}
                height={140}
              />
              <p className="mt-3 text-xs text-muted">
                Conversion rate — {formatRate(analytics.genericConversionRate)} default vs.{" "}
                {formatRate(analytics.personalizedConversionRate)} personalized.{" "}
                {significance?.significant
                  ? significance.direction === "higher"
                    ? `Backed by a real holdout test, ${confidenceLabel(significance.pValue)} confidence.`
                    : "A holdout test shows personalization currently underperforming the default — worth a review."
                  : "Run a holdout test on a site for a causal (not just correlated) comparison."}
              </p>
            </Card>

            {stats.featuredSite ? (
              <FeaturedSiteCard
                siteId={stats.featuredSite.id}
                hostname={stats.featuredSite.hostname}
                summary={stats.featuredSite.summary}
                pageCount={stats.featuredSite.pageCount}
                elementCount={stats.featuredSite.elementCount}
              />
            ) : (
              <Card className="border-dashed">
                <p className="text-sm text-muted">
                  Sites are still being read and understood — check back shortly, or view progress in Sites.
                </p>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
