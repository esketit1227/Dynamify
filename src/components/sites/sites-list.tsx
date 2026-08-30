"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { SiteDTO } from "@/lib/sites/dto";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued",
  CRAWLING: "Reading site…",
  UNDERSTANDING: "Understanding…",
  READY: "Ready",
  FAILED: "Failed",
};

function SiteRow({
  organizationId,
  site,
  onDeleted,
}: {
  organizationId: string;
  site: SiteDTO;
  onDeleted: (siteId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteSite() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/sites/${site.id}`, { method: "DELETE" });
      if (res.ok) onDeleted(site.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-background">
      <Link href={`/sites/${site.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-foreground">{site.url}</p>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${
            site.status === "READY"
              ? "border-transparent bg-[var(--status-positive)]/10 text-[var(--status-positive)]"
              : "border-border text-muted"
          }`}
        >
          {STATUS_LABEL[site.status] ?? site.status}
        </span>
      </Link>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted">Remove this site and all its data?</span>
          <Button type="button" variant="danger" disabled={deleting} onClick={deleteSite} className="text-xs">
            {deleting ? "Removing…" : "Yes, remove"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)} className="text-xs">
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="danger"
          onClick={() => setConfirming(true)}
          className="shrink-0 gap-1.5 text-xs"
        >
          <Trash2 size={13} />
          Remove
        </Button>
      )}
    </li>
  );
}

// Deleting a site cascades to everything crawled from it — pages, content
// elements, personalization rules, recommendations, generated experiences,
// and any visitor data tied to it — so this asks once, explicitly, per
// site (same two-step confirm as Visitors' DSR delete), rather than a
// single accidental click.
export function SitesList({
  organizationId,
  initialSites,
}: {
  organizationId: string;
  initialSites: SiteDTO[];
}) {
  const [sites, setSites] = useState(initialSites);

  if (sites.length === 0) {
    return (
      <EmptyState
        title="No sites connected yet"
        description="Enter a website URL above. We'll crawl it, build an understanding of what it sells and who it's for, and show you a report — nothing on the live site changes."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {sites.map((site) => (
        <SiteRow
          key={site.id}
          organizationId={organizationId}
          site={site}
          onDeleted={(siteId) => setSites((prev) => prev.filter((s) => s.id !== siteId))}
        />
      ))}
    </ul>
  );
}
