"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmbedSnippet } from "@/components/sites/embed-snippet";
import { IpEnrichmentToggle } from "@/components/sites/ip-enrichment-toggle";
import { VisitorTrackingToggle } from "@/components/sites/visitor-tracking-toggle";
import { HoldbackPercentInput } from "@/components/sites/holdback-percent-input";
import { AutoApproveToggle } from "@/components/sites/auto-approve-toggle";
import type { SiteDetailDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

const IN_PROGRESS_STATUSES = new Set(["PENDING", "CRAWLING", "UNDERSTANDING"]);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued",
  CRAWLING: "Reading your site…",
  UNDERSTANDING: "Understanding your brand and content…",
  READY: "Ready",
  FAILED: "Failed",
};

export function SiteDetail({
  organizationId,
  siteId,
  initialSite,
  audiences: initialAudiences,
  origin,
}: {
  organizationId: string;
  siteId: string;
  initialSite: SiteDetailDTO;
  audiences: AudienceDTO[];
  origin: string;
}) {
  const router = useRouter();
  const [site, setSite] = useState(initialSite);
  const [audiences, setAudiences] = useState(initialAudiences);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!IN_PROGRESS_STATUSES.has(site.status)) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/organizations/${organizationId}/sites/${siteId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSite(data.site);

      // The crawl finishing is also the moment cold-start default
      // audiences get seeded server-side — but seedDefaultAudiences runs
      // as a separate, deliberately-isolated step *after* the site's own
      // status flips to READY (service.ts: "a failure seeding starter
      // audiences must never turn a successful connection into a FAILED
      // one"), so there's a real window where READY is visible before
      // seeding has actually landed. `audiences` was only ever passed in
      // from the page's initial server render (taken before any of this
      // happened), and now that "Turn on personalization" depends on it
      // being accurate, a plain one-shot refetch can still lose that race
      // and show "create an audience" for a site that already has three.
      // One bounded retry (not an open-ended poll) covers the real gap —
      // seeding is a handful of sequential inserts, not indefinite work.
      if (!IN_PROGRESS_STATUSES.has(data.site.status)) {
        const fetchAudiences = () => fetch(`/api/organizations/${organizationId}/audiences`);
        let audiencesRes = await fetchAudiences();
        let fetched = audiencesRes.ok ? ((await audiencesRes.json()).audiences as AudienceDTO[]) : [];
        if (fetched.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          audiencesRes = await fetchAudiences();
          fetched = audiencesRes.ok ? ((await audiencesRes.json()).audiences as AudienceDTO[]) : fetched;
        }
        setAudiences(fetched);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [organizationId, siteId, site.status]);

  async function refresh() {
    const res = await fetch(`/api/organizations/${organizationId}/sites/${siteId}`);
    if (res.ok) setSite((await res.json()).site);
  }

  async function retry() {
    setRetrying(true);
    try {
      await fetch(`/api/organizations/${organizationId}/sites/${siteId}/retry`, { method: "POST" });
      router.refresh();
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  if (IN_PROGRESS_STATUSES.has(site.status)) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm font-medium text-foreground">{STATUS_LABEL[site.status]}</p>
        <p className="mt-1 text-xs text-muted">{site.url}</p>
        <p className="mt-4 text-xs text-muted">This usually takes under a minute.</p>
      </div>
    );
  }

  if (site.status === "FAILED") {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/10 p-6">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t read this site</p>
        <p className="mt-1 text-sm text-muted">{site.errorMessage}</p>
        <Button variant="secondary" className="mt-4" disabled={retrying} onClick={retry}>
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }

  const understanding = site.understanding;
  const imageCount = site.pages.reduce(
    (sum, p) => sum + p.elements.filter((el) => el.elementType === "IMAGE" || el.elementType === "LOGO").length,
    0,
  );

  // Ordered to match docs/product-spec.md §15's onboarding narrative — the
  // report (what we found) leads, since that's the payoff for the wait;
  // "optional" data sources and personalization behavior are grouped and
  // labeled as their own steps rather than five unlabeled settings cards
  // in installation order, which is what this looked like before
  // (docs/launch-plan.md §5B — verification-and-polish, not new build,
  // since every one of these already existed).
  return (
    <div className="flex flex-col gap-6">
      {understanding ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Here&apos;s what we found</h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${
                understanding.method === "AI"
                  ? "border-transparent bg-[var(--status-positive)]/10 text-[var(--status-positive)]"
                  : "border-border text-muted"
              }`}
              title={
                understanding.method === "AI"
                  ? "Generated by AI from the crawled content"
                  : "Rule-based analysis — connect an ANTHROPIC_API_KEY for AI-generated insights"
              }
            >
              {understanding.method === "AI" ? "AI-generated" : "Rule-based"}
            </span>
          </div>
          <p className="text-sm text-foreground">
            We found {site.pageCount} {site.pageCount === 1 ? "page" : "pages"}, {site.elementCount} editable
            content elements{imageCount > 0 ? `, and ${imageCount} ${imageCount === 1 ? "image" : "images"}` : ""}.
            Your positioning appears to be: <span className="font-medium">{understanding.productSummary}</span>
          </p>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted">Company</dt>
              <dd className="text-foreground">{understanding.companySummary}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Target customers</dt>
              <dd className="text-foreground">{understanding.targetCustomers}</dd>
            </div>
            {understanding.primaryCta ? (
              <div>
                <dt className="text-xs font-medium text-muted">Primary CTA</dt>
                <dd className="text-foreground">{understanding.primaryCta}</dd>
              </div>
            ) : null}
            {Array.isArray(understanding.valueProps) && understanding.valueProps.length > 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted">Value propositions</dt>
                <dd className="text-foreground">
                  <ul className="list-inside list-disc">
                    {(understanding.valueProps as string[]).map((vp, i) => (
                      <li key={i}>{vp}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-foreground">{site.url}</p>
          <p className="mt-1 text-xs text-muted">
            We found {site.pageCount} {site.pageCount === 1 ? "page" : "pages"} and {site.elementCount}{" "}
            editable content elements.
          </p>
        </div>
      )}

      <EmbedSnippet siteId={site.id} origin={origin} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Connect data sources (optional)</h2>
        <div className="flex flex-col gap-4">
          <IpEnrichmentToggle
            organizationId={organizationId}
            siteId={site.id}
            initialEnabled={site.ipEnrichmentEnabled}
          />
          <VisitorTrackingToggle
            organizationId={organizationId}
            siteId={site.id}
            initialEnabled={site.visitorTrackingEnabled}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Turn on personalization</h2>
        {audiences.length > 0 ? (
          <p className="mb-4 text-xs text-muted">
            {audiences.length} starter {audiences.length === 1 ? "audience is" : "audiences are"} already set up
            for this site.{" "}
            <Link href="/recommendations" className="font-medium text-foreground underline underline-offset-2">
              Check Recommendations
            </Link>{" "}
            for opportunities, or personalize an element directly below.
          </p>
        ) : (
          <p className="mb-4 text-xs text-muted">
            <Link href="/audiences" className="font-medium text-foreground underline underline-offset-2">
              Create an audience
            </Link>{" "}
            to start personalizing elements below.
          </p>
        )}
        <div className="flex flex-col gap-4">
          <HoldbackPercentInput
            organizationId={organizationId}
            siteId={site.id}
            initialPercent={site.holdbackPercent}
          />
          <AutoApproveToggle
            organizationId={organizationId}
            siteId={site.id}
            initialEnabled={site.autoApproveAiContent}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Content</h2>
        <Link
          href={`/content?site=${site.id}`}
          className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-sm hover:border-foreground/40"
        >
          <span className="text-foreground">
            Browse {site.pageCount} {site.pageCount === 1 ? "page" : "pages"} and {site.elementCount} elements
            visually
          </span>
          <span className="text-muted">→</span>
        </Link>
      </div>
    </div>
  );
}
