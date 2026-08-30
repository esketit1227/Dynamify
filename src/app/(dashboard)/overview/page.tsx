import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, MousePointerClick } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getOverviewStats } from "@/lib/overview/service";
import { getOrgAnalytics } from "@/lib/analytics/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { HeroStatCard } from "@/components/dashboard/hero-stat-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { FeaturedSiteCard } from "@/components/dashboard/featured-site-card";
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

  const analytics = await getOrgAnalytics(organization.id);

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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HeroStatCard
              label="Personalization lift"
              value={
                relativeImprovement !== null
                  ? `${relativeImprovement >= 0 ? "+" : ""}${relativeImprovement.toFixed(0)}%`
                  : "Not enough data yet"
              }
              caption="Personalized vs. default conversion rate, across all sites"
            />
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
                {analytics.causalLift?.significance?.significant
                  ? analytics.causalLift.significance.direction === "higher"
                    ? "Backed by a statistically significant holdout test."
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
