"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageDesignPreview } from "@/components/recommendations/page-design-preview";
import type { PageDesignDTO } from "@/lib/sites/designPage";

const STATUS_LABEL: Record<PageDesignDTO["status"], string> = {
  PENDING: "Not reviewed",
  ENDORSED: "Endorsed as a direction",
};
const STATUS_BADGE: Record<PageDesignDTO["status"], "positive" | "neutral"> = {
  PENDING: "neutral",
  ENDORSED: "positive",
};
const METHOD_LABEL: Record<PageDesignDTO["method"], string> = {
  AI: "AI-generated",
  HEURISTIC: "Composed from your site's own content",
};

// Mirrors ExperienceReview's collapsible shell (recommendations-page.tsx),
// but for a standalone design artifact rather than a set of independent
// per-element rules — "Live" never appears anywhere in this component,
// since nothing here ever reaches a visitor. See docs/decisions.md D8.
export function PageDesignReview({
  organizationId,
  design,
  onChanged,
}: {
  organizationId: string;
  design: PageDesignDTO;
  onChanged: (design: PageDesignDTO | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  async function endorse() {
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/page-designs/${design.id}/endorse`, {
        method: "POST",
      });
      if (res.ok) onChanged((await res.json()).design);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/page-designs/${design.id}/reject`, {
        method: "POST",
      });
      if (res.ok) onChanged(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <p className="text-xs font-medium text-foreground">
          New page design · {design.sections.length} {design.sections.length === 1 ? "section" : "sections"}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{METHOD_LABEL[design.method]}</Badge>
          <Badge variant={STATUS_BADGE[design.status]}>{STATUS_LABEL[design.status]}</Badge>
          <ChevronDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open ? (
        <div className="border-t border-border p-3">
          <div className="mb-4 flex gap-2 rounded-lg border border-border bg-surface p-3">
            <Info size={16} className="mt-0.5 shrink-0 text-muted" />
            {design.marketContext ? (
              <div className="text-xs text-muted">
                <p className="mb-1 font-medium text-foreground">Market research — found via web search.</p>
                <p className="mb-2">
                  Summarized by AI, but grounded in the real sources below — not training-knowledge
                  speculation. Worth a skim before you trust it; a summary can still miss nuance even
                  when its sources are real.
                </p>
                <p className="mb-3 whitespace-pre-line">{design.marketContext}</p>
                {design.marketSources.length > 0 ? (
                  <div>
                    <p className="mb-1 font-medium text-foreground">Sources</p>
                    <ul className="flex flex-col gap-1">
                      {design.marketSources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground underline underline-offset-2 hover:text-muted"
                          >
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted">
                No market research for this design — web search isn&apos;t configured for this
                environment, or it didn&apos;t find anything useful to summarize.
              </p>
            )}
          </div>

          <PageDesignPreview sections={design.sections} pageUrl={design.pageUrl} />

          <div className="mt-4">
            {design.status === "PENDING" ? (
              <>
                <div className="flex items-center gap-2">
                  <Button disabled={busy} onClick={endorse}>
                    {busy ? "Working…" : "Endorse this direction"}
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={reject}>
                    Reject
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Endorsing records that you like this direction. It does not change your website —
                  Dynamify never publishes layouts.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Endorsed as a direction. Nothing has been published — implementing this is still up to you.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
