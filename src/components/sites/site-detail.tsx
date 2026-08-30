"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElementPersonalize } from "@/components/sites/element-personalize";
import { EmbedSnippet } from "@/components/sites/embed-snippet";
import { IpEnrichmentToggle } from "@/components/sites/ip-enrichment-toggle";
import { VisitorTrackingToggle } from "@/components/sites/visitor-tracking-toggle";
import { HoldbackPercentInput } from "@/components/sites/holdback-percent-input";
import { AutoApproveToggle } from "@/components/sites/auto-approve-toggle";
import type { SiteDetailDTO, CrawledPageDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

const IN_PROGRESS_STATUSES = new Set(["PENDING", "CRAWLING", "UNDERSTANDING"]);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued",
  CRAWLING: "Reading your site…",
  UNDERSTANDING: "Understanding your brand and content…",
  READY: "Ready",
  FAILED: "Failed",
};

const MAX_ELEMENTS_SHOWN_PER_SECTION = 3;

// Types with no free-text "content" to speak of — IMAGE_LIBRARY_TYPES'
// personalize form offers a picker built from other real values of the
// same type found elsewhere on the site (the "approved asset library" for
// v1: reuse, never invent — same principle text personalization already
// uses), instead of a free-text box.
export const LIBRARY_TYPES = new Set(["IMAGE", "LOGO", "CTA_HREF"]);

export type Library = Record<string, string[]>;

function buildLibrary(pages: CrawledPageDTO["elements"][]): Library {
  const seen: Record<string, Set<string>> = {};
  for (const elements of pages) {
    for (const el of elements) {
      if (!LIBRARY_TYPES.has(el.elementType)) continue;
      const set = seen[el.elementType] ?? (seen[el.elementType] = new Set());
      set.add(el.currentContent);
    }
  }
  const library: Library = {};
  for (const [type, set] of Object.entries(seen)) library[type] = [...set];
  return library;
}

function SectionGroup({
  organizationId,
  section,
  elements,
  audiences,
  library,
  onChanged,
}: {
  organizationId: string;
  section: string;
  elements: CrawledPageDTO["elements"];
  audiences: AudienceDTO[];
  library: Library;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? elements : elements.slice(0, MAX_ELEMENTS_SHOWN_PER_SECTION);
  const remaining = elements.length - visible.length;

  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        {section} <span className="normal-case text-muted/70">· {elements.length}</span>
      </p>
      <ul className="flex flex-col gap-2">
        {visible.map((el) => (
          <li key={el.id} className="text-sm text-foreground">
            <p className="truncate">
              <span className="text-xs text-muted">{el.elementType}:</span> {el.currentContent}
            </p>
            <ElementPersonalize
              organizationId={organizationId}
              element={el}
              audiences={audiences}
              library={library[el.elementType] ?? []}
              onChanged={onChanged}
            />
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:border-foreground/40"
        >
          +{remaining} more
        </button>
      ) : null}
    </div>
  );
}

function PageCard({
  organizationId,
  page,
  audiences,
  library,
  onChanged,
}: {
  organizationId: string;
  page: CrawledPageDTO;
  audiences: AudienceDTO[];
  library: Library;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bySection = new Map<string, typeof page.elements>();
  for (const el of page.elements) {
    const list = bySection.get(el.section) ?? [];
    list.push(el);
    bySection.set(el.section, list);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{page.title ?? page.url}</p>
          <p className="truncate text-xs text-muted">{page.url}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pl-3">
          <span className="text-xs text-muted">
            {page.elements.length} {page.elements.length === 1 ? "element" : "elements"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground">
            {open ? "Hide" : "View"}
            <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </div>
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          {[...bySection.entries()].map(([section, elements]) => (
            <SectionGroup
              key={section}
              organizationId={organizationId}
              section={section}
              elements={elements}
              audiences={audiences}
              library={library}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SiteDetail({
  organizationId,
  siteId,
  initialSite,
  audiences,
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
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!IN_PROGRESS_STATUSES.has(site.status)) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/organizations/${organizationId}/sites/${siteId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSite(data.site);
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
  const library = buildLibrary(site.pages.map((p) => p.elements));

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">{site.url}</p>
        <p className="mt-1 text-xs text-muted">
          We found {site.pageCount} {site.pageCount === 1 ? "page" : "pages"} and {site.elementCount}{" "}
          editable content elements.
        </p>
      </div>

      <EmbedSnippet siteId={site.id} origin={origin} />

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

      {understanding ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Website understanding</h2>
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
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted">Company</dt>
              <dd className="text-foreground">{understanding.companySummary}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Product</dt>
              <dd className="text-foreground">{understanding.productSummary}</dd>
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
      ) : null}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Content by page</h2>
          {audiences.length === 0 ? (
            <p className="text-xs text-muted">
              Create an audience to start personalizing elements below.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          {site.pages.map((page) => (
            <PageCard
              key={page.id}
              organizationId={organizationId}
              page={page}
              audiences={audiences}
              library={library}
              onChanged={refresh}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
