"use client";

import { useState } from "react";

// Off by default (Site.visitorTrackingEnabled) — a plain checkbox, not an
// elaborate consent flow, same posture as IpEnrichmentToggle. Unlike that
// toggle, this one sets a real, persistent first-party cookie in the
// visitor's browser (dynamify_vid) — a re-identifiable visitor, not just an
// enriched anonymous one. See docs/decisions.md D5 for why this stays a
// real opt-in, and for the disclosure/consent caveat no checkbox resolves.
export function VisitorTrackingToggle({
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
        body: JSON.stringify({ visitorTrackingEnabled: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Visitor tracking</h2>
      <p className="mb-3 text-xs text-muted">
        Set a first-party cookie so returning visitors are recognized individually on the{" "}
        <code>Visitors</code> page (page views, intent, stage). Off by default — no persistent
        visitor identity is collected for this site until you turn it on, and doing so may carry
        its own disclosure obligations depending on your jurisdiction.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} disabled={saving} onChange={toggle} />
        Enable visitor tracking for this site
      </label>
    </div>
  );
}
