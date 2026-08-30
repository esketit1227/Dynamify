import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getOrgAnalytics, type CausalLift } from "@/lib/analytics/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/ui/empty-state";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

function formatRate(rate: number | null): string {
  return rate === null ? "Not enough data yet" : `${(rate * 100).toFixed(1)}%`;
}

function RateCard({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{formatRate(rate)}</p>
    </div>
  );
}

// The actual causal-lift verdict, not just "is personalization applied" —
// see src/lib/analytics/significance.ts for why this exists at all: a
// holdout comparison is the same population split by a coin flip, so a
// significant result here is evidence, not just a bigger-looking number.
function CausalVerdict({ causalLift }: { causalLift: CausalLift }) {
  const { significance } = causalLift;

  if (!significance) {
    return <p className="text-sm text-muted">Not enough holdout data yet to say anything with confidence.</p>;
  }
  if (!significance.significant) {
    return (
      <p className="text-sm text-muted">
        No significant difference yet between the holdout and personalized groups — keep collecting data.
      </p>
    );
  }
  if (significance.direction === "higher") {
    return (
      <p className="text-sm font-medium text-[var(--status-positive)]">
        Personalization is significantly helping on this site (p = {significance.pValue.toFixed(4)}).
      </p>
    );
  }
  return (
    <p className="text-sm font-medium text-danger">
      Personalization is significantly underperforming the default on this site (p = {significance.pValue.toFixed(4)}) —
      review your active rules.
    </p>
  );
}

// Compact version of CausalVerdict's logic, for the per-site table row —
// same three-way verdict, badge-sized.
function SiteVerdictBadge({ causalLift }: { causalLift: CausalLift }) {
  const { significance } = causalLift;
  if (!significance) {
    return <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">Not enough data</span>;
  }
  if (!significance.significant) {
    return <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">No difference yet</span>;
  }
  if (significance.direction === "higher") {
    return (
      <span className="rounded-full border border-transparent bg-[var(--status-positive)]/10 px-2.5 py-0.5 text-xs text-[var(--status-positive)]">
        Significantly helping
      </span>
    );
  }
  return (
    <span className="rounded-full border border-transparent bg-danger/10 px-2.5 py-0.5 text-xs text-danger">
      Underperforming
    </span>
  );
}

function CausalLiftCard({ causalLift }: { causalLift: CausalLift }) {
  const lift =
    causalLift.holdoutConversionRate !== null &&
    causalLift.holdoutConversionRate > 0 &&
    causalLift.treatmentConversionRate !== null
      ? ((causalLift.treatmentConversionRate - causalLift.holdoutConversionRate) / causalLift.holdoutConversionRate) * 100
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted">Holdout conversion rate (control)</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatRate(causalLift.holdoutConversionRate)}</p>
          <p className="mt-1 text-xs text-muted">{causalLift.holdoutPageViews.toLocaleString()} held-out visits</p>
        </div>
        <div>
          <p className="text-xs text-muted">Personalized conversion rate (treatment)</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatRate(causalLift.treatmentConversionRate)}</p>
          <p className="mt-1 text-xs text-muted">{causalLift.treatmentPageViews.toLocaleString()} personalized visits</p>
        </div>
      </div>
      {lift !== null ? (
        <p className="mt-3 text-sm text-foreground">
          {lift >= 0 ? "+" : ""}
          {lift.toFixed(0)}% relative difference — same qualifying population, split by a coin flip.
        </p>
      ) : null}
      <div className="mt-2">
        <CausalVerdict causalLift={causalLift} />
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const analytics = await getOrgAnalytics(organization.id);

  // Relative improvement only means something against a non-zero generic
  // rate — some views but zero generic clicks makes the ratio undefined,
  // not "infinitely better." Both rates are still shown side by side
  // either way; this callout is an addition, not the only comparison.
  const relativeImprovement =
    analytics.genericConversionRate !== null &&
    analytics.genericConversionRate > 0 &&
    analytics.personalizedConversionRate !== null
      ? ((analytics.personalizedConversionRate - analytics.genericConversionRate) / analytics.genericConversionRate) * 100
      : null;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Generic vs. personalized: does personalization move the number?"
      />

      {!analytics.hasAnyData ? (
        <EmptyState
          title="No data yet"
          description="Analytics start collecting once a connected site's embed script is installed and gets real visitors. Connect a site and set up an audience first, then check back."
        />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Page views" value={analytics.totals.pageViews} />
            <StatCard label="Personalized page views" value={analytics.totals.personalizedPageViews} />
            <StatCard label="CTA clicks" value={analytics.totals.ctaClicks} />
            <StatCard label="Personalized CTA clicks" value={analytics.totals.personalizedCtaClicks} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Generic vs. personalized</h2>
            <div className="grid grid-cols-2 gap-4">
              <RateCard label="Generic conversion rate" rate={analytics.genericConversionRate} />
              <RateCard label="Personalized conversion rate" rate={analytics.personalizedConversionRate} />
            </div>
            {relativeImprovement !== null ? (
              <p className="mt-3 text-sm text-foreground">
                {relativeImprovement >= 0 ? "+" : ""}
                {relativeImprovement.toFixed(0)}% relative {relativeImprovement >= 0 ? "improvement" : "difference"}{" "}
                from personalization.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              A CTA click is this product&apos;s conversion signal — this is a ratio across independent visits,
              not a per-visitor funnel (no visitor identity is tracked; see docs/decisions.md D7). This
              compares visitors who matched a rule against visitors who didn&apos;t — different populations,
              not a controlled comparison. For a causal number, see below.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Causal lift (holdout test)</h2>
            {analytics.causalLift ? (
              <CausalLiftCard causalLift={analytics.causalLift} />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-surface p-4">
                <p className="text-sm text-muted">
                  No site is running a holdout experiment yet, so there&apos;s no causal comparison to show. Turn on
                  a holdback percentage on a site to measure whether personalization is actually causing the
                  difference, not just correlated with it.
                </p>
                <Link href="/sites" className="mt-2 inline-block text-sm font-medium text-foreground underline underline-offset-2">
                  Go to Sites
                </Link>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Per site</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Site</th>
                    <th className="px-4 py-2 font-medium">Views</th>
                    <th className="px-4 py-2 font-medium">CTA clicks</th>
                    <th className="px-4 py-2 font-medium">Generic rate</th>
                    <th className="px-4 py-2 font-medium">Personalized rate</th>
                    <th className="px-4 py-2 font-medium">Causal verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.perSite.map((row) => (
                    <tr key={row.siteId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">{row.siteUrl}</td>
                      <td className="px-4 py-2">
                        {row.pageViews.toLocaleString()} generic · {row.personalizedPageViews.toLocaleString()}{" "}
                        personalized
                      </td>
                      <td className="px-4 py-2">
                        {row.ctaClicks.toLocaleString()} generic · {row.personalizedCtaClicks.toLocaleString()}{" "}
                        personalized
                      </td>
                      <td className="px-4 py-2">{formatRate(row.genericConversionRate)}</td>
                      <td className="px-4 py-2">{formatRate(row.personalizedConversionRate)}</td>
                      <td className="px-4 py-2">
                        {row.causalLift ? (
                          <SiteVerdictBadge causalLift={row.causalLift} />
                        ) : (
                          <span className="text-xs text-muted">{row.holdbackPercent > 0 ? "No holdout data yet" : "Holdout off"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
