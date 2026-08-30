"use client";

import { useState } from "react";

const MAX_HOLDBACK_PERCENT = 50;

// Off by default (Site.holdbackPercent = 0) — a number input, not a
// checkbox, since this is a dial rather than a switch. See
// src/lib/experiments/holdout.ts: this is the actual fix for the
// generic-vs-personalized comparison being confounded (different
// populations, not a control group) — holding back a % of otherwise-
// qualifying visitors to the default gives Analytics a real control
// group to compare against.
export function HoldbackPercentInput({
  organizationId,
  siteId,
  initialPercent,
}: {
  organizationId: string;
  siteId: string;
  initialPercent: number;
}) {
  const [percent, setPercent] = useState(initialPercent);
  const [draft, setDraft] = useState(String(initialPercent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdbackPercent: value }),
      });
      if (res.ok) {
        setPercent(value);
      } else {
        setDraft(String(percent));
        setError("Couldn't save — try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  function onBlur() {
    const parsed = Number(draft);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_HOLDBACK_PERCENT) {
      setDraft(String(percent));
      return;
    }
    if (parsed !== percent) void save(parsed);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">A/B holdout</h2>
      <p className="mb-3 text-xs text-muted">
        Hold back a percentage of visitors who&apos;d otherwise get personalized content, showing them the
        default instead. This gives Analytics a real control group to measure causal lift against, instead of
        just comparing visitors who matched a rule to visitors who didn&apos;t. Off by default (0%) — capped at{" "}
        {MAX_HOLDBACK_PERCENT}%.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="number"
          min={0}
          max={MAX_HOLDBACK_PERCENT}
          step={1}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={onBlur}
          className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        % of qualifying visitors held back to the default
      </label>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
