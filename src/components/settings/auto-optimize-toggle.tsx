"use client";

import { useState } from "react";

// docs/launch-plan.md §5C ("Auto-draft") — off by default, same explicit
// opt-in shape as every other toggle in this app (IpEnrichmentToggle,
// VisitorTrackingToggle, ...). Org-wide because recommendation detection
// and generation already are (src/lib/recommendations/service.ts) — this
// never bypasses approval, it only automates finding an opportunity and
// drafting copy for it, steps that were previously manual clicks.
export function AutoOptimizeToggle({
  organizationId,
  initialEnabled,
}: {
  organizationId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/auto-optimize`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Auto-optimize</h2>
      <p className="mb-3 text-xs text-muted">
        Once a day, automatically look for real segment opportunities across every connected site
        and draft AI copy for them — the same as clicking &quot;Check for recommendations&quot; and
        then accepting each one yourself. Every draft still lands pending your review; nothing
        goes live until you approve it. Off by default.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} disabled={saving} onChange={toggle} />
        Automatically find and draft new experiences
      </label>
    </div>
  );
}
