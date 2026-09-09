"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { RenderedPreview } from "@/components/liveview/rendered-preview";
import { WebsitePreview } from "@/components/liveview/website-preview";
import { sectionLabel, elementTypeLabel } from "@/lib/format/labels";
import type { ResolvedPage } from "@dynamify/personalization-sdk";
import type { GeneratedExperienceDTO, PreviewElementDTO } from "@/lib/sites/generateExperience";
import type { ElementPersonalizationRuleDTO } from "@/lib/sites/personalization";

const EMPTY_CONTEXT = {};

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
//
// `draft`, when given, overlays whatever's currently typed in the side
// panel for the one element being edited — the "live preview as you type"
// requirement — without touching matchedVariantId/matchedRuleId (those
// still reflect the *saved* rule, so the personalized-glow animation keeps
// meaning "this was already personalized," not "you're currently typing").
function buildPreview(
  experience: GeneratedExperienceDTO,
  applyExperience: boolean,
  draft?: { contentElementId: string; content: string },
): ResolvedPage {
  const byElement = new Map(experience.rules.map((r) => [r.contentElementId, r] as const));
  return {
    id: experience.crawledPageId,
    components: experience.pageElements.map((el, order) => {
      const rule = applyExperience ? byElement.get(el.id) : undefined;
      const draftContent = applyExperience && draft?.contentElementId === el.id ? draft.content : undefined;
      return {
        id: el.id,
        type: el.elementType,
        section: el.section,
        order,
        content: { text: draftContent ?? (rule ? rule.content : el.currentContent) },
        matchedVariantId: rule?.elementVariantId,
        matchedRuleId: rule?.id,
      };
    }),
  };
}

// The focused editor for whichever single element is currently selected —
// replaces the old always-rendered-per-row list entirely, and now a real
// side panel (same slide-over pattern as review-panel.tsx, not an inline
// card) with the preview updating live as you type rather than only after
// Save — `content`/`onContentChange` are controlled from ExperienceReview
// so it can feed the current draft into buildPreview. Selecting an
// annotation *is* the entry point now, so there's no separate view/edit
// toggle: this only ever renders in edit mode.
function SelectedElementEditor({
  organizationId,
  rule,
  element,
  content,
  onContentChange,
  onChanged,
  onClose,
}: {
  organizationId: string;
  rule: ElementPersonalizationRuleDTO;
  element: PreviewElementDTO | undefined;
  content: string;
  onContentChange: (content: string) => void;
  onChanged: (rule: ElementPersonalizationRuleDTO) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 bg-foreground/10"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Edit this element"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.2 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface p-5 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {element ? sectionLabel(element.section) : ""}
            </p>
            <h2 className="text-sm font-semibold text-foreground">
              {element ? elementTypeLabel(element.elementType) : ""}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span>{METHOD_LABEL[rule.method] ?? rule.method}</span>
              <Badge variant={RULE_STATUS_BADGE[rule.status] ?? "neutral"}>
                {RULE_STATUS_LABEL[rule.status] ?? rule.status}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <FormError message={error} />
        <p className="mb-1.5 text-xs text-muted">
          Updates the preview as you type — nothing is saved until you choose an option below.
        </p>
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={6}
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center gap-2">
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
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
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
  const [viewingAudience, setViewingAudience] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [websiteAvailable, setWebsiteAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const canAct = experience.status === "PENDING" || experience.status === "PARTIALLY_APPROVED";

  // The join ElementPersonalizationRuleDTO doesn't carry on its own
  // (it has no `section`) — cross-referenced against pageElements by
  // contentElementId, once per experience change, for the summary,
  // the annotations, and the editor's header eyebrow.
  const elementById = useMemo(
    () => new Map(experience.pageElements.map((el) => [el.id, el] as const)),
    [experience.pageElements],
  );

  const ruleAnnotations = useMemo(() => {
    const map = new Map<string, { status: "pending" | "approved" }>();
    for (const rule of experience.rules) {
      map.set(rule.contentElementId, { status: rule.status === "APPROVED" ? "approved" : "pending" });
    }
    return map;
  }, [experience.rules]);

  const ruleElementIds = useMemo(
    () => new Set(experience.rules.map((r) => r.contentElementId)),
    [experience.rules],
  );

  // The grouped, smart summary replacing "Full experience · N pieces" —
  // section order follows first-appearance among this experience's own
  // rules, so it reads top-to-bottom like the page itself.
  const sectionCounts = useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, number>();
    for (const rule of experience.rules) {
      const section = elementById.get(rule.contentElementId)?.section;
      if (!section) continue;
      if (!counts.has(section)) order.push(section);
      counts.set(section, (counts.get(section) ?? 0) + 1);
    }
    return order.map((section) => ({ section, count: counts.get(section)! }));
  }, [experience.rules, elementById]);

  const approvedCount = experience.rules.filter((r) => r.status === "APPROVED").length;
  const pendingCount = experience.rules.length - approvedCount;
  const selectedRule = experience.rules.find((r) => r.contentElementId === selectedElementId) ?? null;

  function selectElement(elementId: string) {
    const rule = experience.rules.find((r) => r.contentElementId === elementId);
    if (!rule) return;
    setSelectedElementId(elementId);
    setDraftContent(rule.content);
  }

  function closeEditor() {
    setSelectedElementId(null);
    setDraftContent("");
  }

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
    <div className="mt-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{experience.audienceName}</p>
        <Badge variant={EXPERIENCE_STATUS_BADGE[experience.status]}>
          {EXPERIENCE_STATUS_LABEL[experience.status]}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {sectionCounts.map(({ section, count }) => (
          <span
            key={section}
            className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted"
          >
            {sectionLabel(section)} · {count}
          </span>
        ))}
        {pendingCount > 0 ? <Badge variant="neutral">{pendingCount} pending</Badge> : null}
        {approvedCount > 0 ? <Badge variant="positive">{approvedCount} live</Badge> : null}
      </div>
      {experience.pastResultsUsed > 0 ? (
        <p className="mt-1.5 text-xs text-muted">
          Informed by {experience.pastResultsUsed} past result{experience.pastResultsUsed === 1 ? "" : "s"} in your
          account
        </p>
      ) : null}

      <div className="mt-3 inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
        <button
          type="button"
          aria-pressed={!viewingAudience}
          onClick={() => setViewingAudience(false)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            !viewingAudience ? "bg-foreground text-background" : "text-muted hover:text-foreground"
          }`}
        >
          Default
        </button>
        <button
          type="button"
          aria-pressed={viewingAudience}
          onClick={() => setViewingAudience(true)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            viewingAudience ? "bg-foreground text-background" : "text-muted hover:text-foreground"
          }`}
        >
          {experience.audienceName}
        </button>
      </div>

      <div className={`mt-3 grid grid-cols-1 gap-3 ${websiteAvailable ? "xl:grid-cols-2" : ""}`}>
        {websiteAvailable ? (
          <WebsitePreview
            organizationId={organizationId}
            pageId={experience.crawledPageId}
            context={EMPTY_CONTEXT}
            label="Live site, right now"
            onAvailabilityChange={setWebsiteAvailable}
          />
        ) : null}
        <RenderedPreview
          resolved={buildPreview(
            experience,
            viewingAudience,
            selectedElementId ? { contentElementId: selectedElementId, content: draftContent } : undefined,
          )}
          pageUrl={experience.pageUrl}
          label={viewingAudience ? experience.audienceName : "Default"}
          onElementClick={viewingAudience ? selectElement : undefined}
          selectedComponentId={viewingAudience ? selectedElementId : undefined}
          annotations={viewingAudience ? ruleAnnotations : undefined}
          clickableComponentIds={viewingAudience ? ruleElementIds : undefined}
        />
      </div>

      {viewingAudience && selectedRule ? (
        <SelectedElementEditor
          key={selectedRule.id}
          organizationId={organizationId}
          rule={selectedRule}
          element={elementById.get(selectedRule.contentElementId)}
          content={draftContent}
          onContentChange={setDraftContent}
          onChanged={updateRule}
          onClose={closeEditor}
        />
      ) : null}

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
  );
}
