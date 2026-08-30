"use client";

import { useState } from "react";

// Off by default (Site.autoApproveAiContent) — docs/roadmap.md Hardening.
// Scoped narrowly on the server (generateImageVariant,
// src/lib/sites/generateImage.ts): only AI-generated images, and only for
// elements whose effective boundary (src/lib/sites/boundaries.ts) is
// Allowed. A Restricted element exists specifically because it needs a
// human's judgment, so this can never skip that regardless of this
// setting — stated here too, not just in the code, since it's the whole
// reason this is safe to offer as an opt-in.
export function AutoApproveToggle({
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
        body: JSON.stringify({ autoApproveAiContent: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">AI auto-approval</h2>
      <p className="mb-3 text-xs text-muted">
        When on, new AI-generated images for elements marked Allowed go live immediately, without a manual
        Approve click. Restricted and Never elements always need manual approval, regardless of this setting.
        Off by default.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} disabled={saving} onChange={toggle} />
        Auto-approve AI-generated images for this site
      </label>
    </div>
  );
}
