"use client";

import { useState } from "react";

const LIMITS = { rawEventRetentionDays: 395, sessionRetentionDays: 90, visitorRetentionDays: 730 };

const FIELDS = [
  {
    key: "rawEventRetentionDays" as const,
    label: "Raw events",
    description: "Page views and CTA clicks, before they're aggregated and deleted.",
  },
  {
    key: "sessionRetentionDays" as const,
    label: "Session detail",
    description: "Per-visit referrer, device, and geo detail.",
  },
  {
    key: "visitorRetentionDays" as const,
    label: "Visitor profiles",
    description: "A tracked visitor's whole record, counted from their last activity.",
  },
];

type Windows = { rawEventRetentionDays: number; sessionRetentionDays: number; visitorRetentionDays: number };

// docs/visitor-data.md Retention: "our defaults as the maximum, not the
// minimum" — every field is capped at the shipped default; a merchant
// can only make these windows shorter, never longer.
export function RetentionSettingsForm({
  organizationId,
  initialWindows,
}: {
  organizationId: string;
  initialWindows: Windows;
}) {
  const [saved, setSaved] = useState(initialWindows);
  const [draft, setDraft] = useState(initialWindows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = FIELDS.some((f) => draft[f.key] !== saved[f.key]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/retention`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }
      setSaved(draft);
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Data retention</h2>
      <p className="mb-4 text-xs text-muted">
        How long visitor data is kept before it&apos;s deleted. These are our recommended maximums — you can
        set them shorter, not longer.
      </p>
      <div className="flex flex-col gap-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="text-foreground">{field.label}</span>
              <span className="block text-xs text-muted">{field.description}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={LIMITS[field.key]}
                value={draft[field.key]}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [field.key]: Math.min(LIMITS[field.key], Math.max(1, Number(e.target.value) || 1)),
                  }))
                }
                className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-muted">days</span>
            </span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
      {dirty ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDraft(saved)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
