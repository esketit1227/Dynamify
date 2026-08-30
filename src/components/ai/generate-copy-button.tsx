"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import type { ComponentType } from "@/lib/pages/componentFields";

export function GenerateCopyButton({
  organizationId,
  componentId,
  type,
  onApproved,
}: {
  organizationId: string;
  componentId: string;
  type: ComponentType;
  onApproved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ id: string; content: Record<string, string> } | null>(
    null,
  );

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/ai/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentId, type, brief }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate.");
        return;
      }
      setProposal({ id: data.proposal.id, content: data.proposal.proposedContent });
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
      setBrief("");
      if (action === "approve") onApproved();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline underline-offset-2"
      >
        Generate with AI
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
      <FormError message={error} />
      {!proposal ? (
        <>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            placeholder="What should this say?"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={loading || !brief} onClick={generate}>
              {loading ? "Generating…" : "Generate"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-muted">Proposed — nothing saved until approved</p>
          <div className="rounded-md bg-background p-2 text-xs">
            {Object.entries(proposal.content).map(([k, v]) => (
              <p key={k}>
                <strong>{k}:</strong> {v}
              </p>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={loading} onClick={() => respond("approve")}>
              Approve — use this
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
