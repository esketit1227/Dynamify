"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { EmptyState } from "@/components/ui/empty-state";
import type { CampaignDTO, CampaignResultsDTO } from "@/lib/campaigns/dto";
import type { PageDTO } from "@/lib/pages/dto";

const GOAL_EVENTS = ["CTA_CLICK", "FORM_SUBMIT", "CONVERSION"];

function rate(goalEvents: number, visitors: number): string {
  if (visitors === 0) return "—";
  return `${((goalEvents / visitors) * 100).toFixed(1)}%`;
}

function CampaignRow({
  organizationId,
  campaign,
}: {
  organizationId: string;
  campaign: CampaignDTO;
}) {
  const [results, setResults] = useState<CampaignResultsDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/campaigns/${campaign.id}`);
      const data = await res.json();
      setResults(data.campaign);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="border-b border-border last:border-0">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-background"
      >
        <div>
          <p className="text-sm font-medium text-foreground">{campaign.name}</p>
          <p className="text-xs text-muted">
            {campaign.pageName} · goal: {campaign.goalEventType} · {campaign.splitPercent}% split
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
          {campaign.status}
        </span>
      </button>

      {open && results ? (
        <div className="grid grid-cols-2 gap-4 px-4 pb-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted">Default (no personalization)</p>
            <p className="mt-1 text-sm text-foreground">
              {results.results.default.visitors} visitors · {results.results.default.goalEvents}{" "}
              goal events · {rate(results.results.default.goalEvents, results.results.default.visitors)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted">Personalized</p>
            <p className="mt-1 text-sm text-foreground">
              {results.results.variant.visitors} visitors · {results.results.variant.goalEvents}{" "}
              goal events · {rate(results.results.variant.goalEvents, results.results.variant.visitors)}
            </p>
          </div>
        </div>
      ) : null}
      {loading ? <p className="px-4 pb-4 text-xs text-muted">Loading results…</p> : null}
    </li>
  );
}

export function CampaignsManager({
  organizationId,
  initialCampaigns,
  pages,
}: {
  organizationId: string;
  initialCampaigns: CampaignDTO[];
  pages: PageDTO[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [goalEventType, setGoalEventType] = useState("CTA_CLICK");
  const [splitPercent, setSplitPercent] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          pageId,
          goalEventType,
          splitPercent: Number(splitPercent) || 50,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create campaign.");
        return;
      }
      setCampaigns((c) => [data.campaign, ...c]);
      setCreating(false);
      setName("");
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (pages.length === 0) {
    return (
      <EmptyState
        title="Create a page first"
        description="Campaigns run against a published page — head to Pages to create one."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {creating ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <FormError message={error} />
          <div>
            <Label htmlFor="campaign-name">Name</Label>
            <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="campaign-page">Page</Label>
            <select
              id="campaign-page"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="campaign-goal">Goal event</Label>
            <select
              id="campaign-goal"
              value={goalEventType}
              onChange={(e) => setGoalEventType(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {GOAL_EVENTS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="campaign-split">Split % seeing personalized content</Label>
            <Input
              id="campaign-split"
              value={splitPercent}
              onChange={(e) => setSplitPercent(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={saving || !name} onClick={save}>
              {saving ? "Creating…" : "Create campaign"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setCreating(true)}>New campaign</Button>
      )}

      {campaigns.length === 0 && !creating ? (
        <EmptyState
          title="No campaigns yet"
          description="A campaign compares a page's personalized content against showing everyone the default — simple 50/50 split, no statistical engine."
        />
      ) : (
        <ul className="rounded-lg border border-border bg-surface">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} organizationId={organizationId} campaign={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
