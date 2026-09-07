"use client";

import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { RenderedPreview } from "@/components/liveview/rendered-preview";
import type { ResolvedPage } from "@dynamify/personalization-sdk";
import type { GeneratedExperienceDTO } from "@/lib/sites/generateExperience";
import type { ElementPersonalizationRuleDTO } from "@/lib/sites/personalization";

const EXPERIENCE_STATUS_LABEL: Record<GeneratedExperienceDTO["status"], string> = {
  PENDING: "Pending review",
  PARTIALLY_APPROVED: "Partially approved",
  APPROVED: "Live",
  REJECTED: "Rejected",
};

const EXPERIENCE_STATUS_BADGE: Record<GeneratedExperienceDTO["status"], "positive" | "neutral" | "danger"> = {
  PENDING: "neutral",
  PARTIALLY_APPROVED: "neutral",
  APPROVED: "positive",
  REJECTED: "danger",
};

const RULE_STATUS_LABEL: Record<string, string> = { APPROVED: "Live", DISABLED: "Paused", PENDING: "Pending" };
const RULE_STATUS_BADGE: Record<string, "positive" | "neutral" | "danger"> = {
  APPROVED: "positive",
  DISABLED: "danger",
  PENDING: "neutral",
};
const METHOD_LABEL: Record<string, string> = {
  AI: "AI-generated",
  HEURISTIC: "Selected from site content",
  MANUAL: "Manual",
};

// Deliberately not resolve() (packages/sdk) — a GeneratedExperience already
// has an exact, unambiguous 1:1 mapping from element to the piece
// generated for it, so this overlays that mapping directly rather than
// fabricating a VisitorContext that would satisfy the audience's own
// targeting rules.
function buildPreview(experience: GeneratedExperienceDTO, applyExperience: boolean): ResolvedPage {
  const byElement = new Map(experience.rules.map((r) => [r.contentElementId, r] as const));
  return {
    id: experience.crawledPageId,
    components: experience.pageElements.map((el, order) => {
      const rule = applyExperience ? byElement.get(el.id) : undefined;
      return {
        id: el.id,
        type: el.elementType,
        section: el.section,
        order,
        content: { text: rule ? rule.content : el.currentContent },
        matchedVariantId: rule?.elementVariantId,
        matchedRuleId: rule?.id,
      };
    }),
  };
}

// The rewrite affordance itself — view mode shows today's read-only row;
// editing mode is a plain textarea (same styling as
// element-personalize.tsx's own content editor) with "Save"/"Save & make
// live"/"Cancel". "Save & make live" only appears for a rule that isn't
// already APPROVED — for one that's already live, editing it *is* the
// live-content change, so only "Save" is offered.
function RuleRow({
  organizationId,
  rule,
  onChanged,
}: {
  organizationId: string;
  rule: ElementPersonalizationRuleDTO;
  onChanged: (rule: ElementPersonalizationRuleDTO) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(rule.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setContent(rule.content);
    setError(null);
    setEditing(true);
  }

  async function save(makeLive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/content-elements/${rule.contentElementId}/personalize/${rule.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "Couldn't save. Try again.");
        return;
      }
      let saved: ElementPersonalizationRuleDTO = data.rule;

      if (makeLive && saved.status !== "APPROVED") {
        const approveRes = await fetch(
          `/api/organizations/${organizationId}/content-elements/${rule.contentElementId}/personalize/${rule.id}/approve`,
          { method: "POST" },
        );
        const approveData = await approveRes.json().catch(() => null);
        if (approveRes.ok && approveData) saved = approveData.rule;
      }

      onChanged(saved);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <li className="rounded-md border border-border bg-surface p-2.5">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
          <span>{METHOD_LABEL[rule.method] ?? rule.method}</span>
          <div className="flex items-center gap-2">
            <Badge variant={RULE_STATUS_BADGE[rule.status] ?? "neutral"}>
              {RULE_STATUS_LABEL[rule.status] ?? rule.status}
            </Badge>
            <button
              type="button"
              onClick={startEdit}
              className="flex items-center gap-1 text-muted underline underline-offset-2 hover:text-foreground"
            >
              <Pencil size={11} />
              Edit
            </button>
          </div>
        </div>
        <p className="truncate text-foreground">{rule.content}</p>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-border bg-surface p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{METHOD_LABEL[rule.method] ?? rule.method}</span>
        <Badge variant={RULE_STATUS_BADGE[rule.status] ?? "neutral"}>
          {RULE_STATUS_LABEL[rule.status] ?? rule.status}
        </Badge>
      </div>
      <FormError message={error} />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        {rule.status === "APPROVED" ? (
          <Button type="button" disabled={busy || !content.trim()} onClick={() => save(false)}>
            {busy ? "Saving…" : "Save"}
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" disabled={busy || !content.trim()} onClick={() => save(false)}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" disabled={busy || !content.trim()} onClick={() => save(true)}>
              {busy ? "Saving…" : "Save & make live"}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </li>
  );
}

export function ExperienceReview({
  organizationId,
  experience,
  onChanged,
}: {
  organizationId: string;
  experience: GeneratedExperienceDTO;
  onChanged: (experience: GeneratedExperienceDTO | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const canAct = experience.status === "PENDING" || experience.status === "PARTIALLY_APPROVED";

  function updateRule(updated: ElementPersonalizationRuleDTO) {
    onChanged({ ...experience, rules: experience.rules.map((r) => (r.id === updated.id ? updated : r)) });
  }

  async function approveAll() {
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/experiences/${experience.id}/approve-all`, {
        method: "POST",
      });
      if (res.ok) onChanged((await res.json()).experience);
    } finally {
      setBusy(false);
    }
  }

  async function rejectAll() {
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/experiences/${experience.id}/reject-all`, {
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
          Full experience · {experience.rules.length} {experience.rules.length === 1 ? "piece" : "pieces"}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant={EXPERIENCE_STATUS_BADGE[experience.status]}>
            {EXPERIENCE_STATUS_LABEL[experience.status]}
          </Badge>
          <ChevronDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open ? (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RenderedPreview resolved={buildPreview(experience, false)} pageUrl={experience.pageUrl} label="Default" />
            <RenderedPreview
              resolved={buildPreview(experience, true)}
              pageUrl={experience.pageUrl}
              label={experience.audienceName}
            />
          </div>

          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {experience.rules.map((rule) => (
              <RuleRow key={rule.id} organizationId={organizationId} rule={rule} onChanged={updateRule} />
            ))}
          </ul>

          {canAct ? (
            <div className="mt-4 flex items-center gap-2">
              <Button disabled={busy} onClick={approveAll}>
                {busy ? "Working…" : "Approve all"}
              </Button>
              <Button variant="danger" disabled={busy} onClick={rejectAll}>
                Reject all
              </Button>
            </div>
          ) : experience.status === "REJECTED" ? (
            <p className="mt-4 text-xs text-muted">This experience was rejected.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
