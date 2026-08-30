"use client";

import { useState } from "react";

// Phase 6 (docs/roadmap.md): off by default (Site.ipEnrichmentEnabled) —
// a plain checkbox, not an elaborate consent flow, but still an explicit
// action a human has to take before this site starts looking up visitor
// IPs against a third-party company database. See docs/decisions.md D5
// for why this stays a real opt-in rather than a default.
export function IpEnrichmentToggle({
  organizationId,
  siteId,
  initialEnabled,
}: {
  organizationId: string;
  siteId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipEnrichmentEnabled: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Company enrichment</h2>
      <p className="mb-3 text-xs text-muted">
        Look up each visitor&apos;s company from their IP address (no OAuth, no visitor action) so
        pages can personalize by <code>attributes.company</code>. Off by default — company data is
        never collected for this site until you turn it on.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} disabled={saving} onChange={toggle} />
        Enable company enrichment for this site
      </label>
    </div>
  );
}
