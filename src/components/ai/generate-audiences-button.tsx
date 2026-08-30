"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

type ProposedAudience = {
  name: string;
  description: string;
  rules: Array<{ field: string; operator: string; value: unknown }>;
};

export function GenerateAudiencesButton({
  organizationId,
  onApproved,
}: {
  organizationId: string;
  onApproved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    id: string;
    audiences: ProposedAudience[];
  } | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/ai/audiences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDescription: prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate.");
        return;
      }
      setProposal({ id: data.proposal.id, audiences: data.proposal.proposedContent.audiences });
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function respond(action: "approve" | "reject") {
    if (!proposal) return;
    setLoading(true);
    try {
      await fetch(
        `/api/organizations/${organizationId}/ai/proposals/${proposal.id}/${action}`,
        { method: "POST" },
      );
      setProposal(null);
      setOpen(false);
      setPrompt("");
      if (action === "approve") onApproved();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Generate with AI
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <FormError message={error} />

      {!proposal ? (
        <>
          <label className="text-xs font-medium text-muted">
            Describe your business — AI will propose a few audience segments
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="e.g. A project management SaaS for creative agencies"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={loading || !prompt} onClick={generate}>
              {loading ? "Generating…" : "Generate"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-muted">
            Proposed audiences — nothing is saved until you approve
          </p>
          <ul className="flex flex-col gap-2">
            {proposal.audiences.map((a, i) => (
              <li key={i} className="rounded-md border border-border p-2 text-sm">
                <p className="font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted">{a.description}</p>
                <p className="mt-1 text-xs text-muted">
                  {a.rules.map((r) => `${r.field} ${r.operator} ${JSON.stringify(r.value)}`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" disabled={loading} onClick={() => respond("approve")}>
              Approve — create these audiences
            </Button>
            <Button type="button" variant="ghost" disabled={loading} onClick={() => respond("reject")}>
              Discard
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
