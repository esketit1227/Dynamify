"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ChevronDown,
  Plus,
  Clock,
  CheckCircle2,
  PauseCircle,
  Play,
  Pause,
  Trash2,
  SlidersHorizontal,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { boundaryReason } from "@/lib/sites/boundaries";
import type { ContentElementDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

const BOUNDARY_LABEL = { ALLOWED: "Allowed", RESTRICTED: "Restricted", NEVER: "Never" } as const;

const METHOD_LABEL: Record<string, string> = {
  AI: "AI-generated",
  HEURISTIC: "Selected from site content",
  MANUAL: "Manually written",
};

const IMAGE_TYPES = new Set(["IMAGE", "LOGO"]);
const LIBRARY_TYPES = new Set(["IMAGE", "LOGO", "CTA_HREF"]);

// One place to say, in plain language, what each status means and what
// visitors actually experience right now — not just a colored pill.
const STATUS_META = {
  PENDING: {
    label: "Pending",
    icon: Clock,
    badge: "neutral" as const,
    note: "Visitors won't see this until you turn it on.",
  },
  APPROVED: {
    label: "Live",
    icon: CheckCircle2,
    badge: "positive" as const,
    note: "Live — this audience sees it now.",
  },
  DISABLED: {
    label: "Paused",
    icon: PauseCircle,
    badge: "neutral" as const,
    note: "Paused — visitors see the default.",
  },
};

function ContentPreview({ elementType, content }: { elementType: string; content: string }) {
  if (IMAGE_TYPES.has(elementType) && content) {
    // next/image needs a known allowlist of remote domains — these are
    // arbitrary customer sites' own crawled images, a different origin
    // per organization, which can't be known in advance. Plain <img> is
    // deliberate here, not an oversight.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={content} alt="" className="mt-1 h-12 w-12 rounded border border-border object-cover" />;
  }
  return <p className="text-foreground">{content}</p>;
}

// closed -> the "show something different" button. adding -> the form.
// justSaved -> a real rule now exists (PENDING) and this asks, in one
// obvious next step, whether to turn it on — instead of silently closing
// and leaving the merchant to go find a different control later.
type Mode = "closed" | "adding" | "justSaved";

export function ElementPersonalize({
  organizationId,
  element,
  audiences,
  library,
  onChanged,
}: {
  organizationId: string;
  element: ContentElementDTO;
  audiences: AudienceDTO[];
  library: string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("closed");
  const [justSavedRuleId, setJustSavedRuleId] = useState<string | null>(null);
  const [justSavedStatus, setJustSavedStatus] = useState<"PENDING" | "APPROVED" | null>(null);
  const [boundarySaving, setBoundarySaving] = useState(false);
  const [acknowledgeRestricted, setAcknowledgeRestricted] = useState(false);
  const [audienceId, setAudienceId] = useState(audiences[0]?.id ?? "");
  const isFromLibrary = LIBRARY_TYPES.has(element.elementType);
  const libraryOptions = library.filter((v) => v !== element.currentContent);
  const [content, setContent] = useState(isFromLibrary ? (libraryOptions[0] ?? "") : element.currentContent);
  const [priority, setPriority] = useState("0");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  async function addRule() {
    setError(null);
    if (!audienceId) {
      setError("Choose an audience first.");
      return;
    }
    if (!content) {
      setError("Nothing to personalize with yet.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/content-elements/${element.id}/personalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audienceId,
            content,
            priority: Number(priority) || 0,
            acknowledgedRestricted: acknowledgeRestricted,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }
      // Doesn't call onChanged() yet — the rule stays PENDING and out of
      // the list above until the "Turn on now? / Not yet" prompt below is
      // resolved, so there's exactly one place to act next, not two.
      setJustSavedRuleId(data.rule.id);
      setJustSavedStatus(data.rule.status);
      setAcknowledgeRestricted(false);
      setMode("justSaved");
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  // Creates a real PENDING rule directly, server-side
  // (src/lib/sites/generateImage.ts) — same "what happens next" prompt as
  // addRule once it succeeds.
  async function generateImage() {
    setError(null);
    if (!audienceId) {
      setError("Choose an audience first.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/content-elements/${element.id}/generate-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audienceId,
            brief: brief.trim() || undefined,
            acknowledgedRestricted: acknowledgeRestricted,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate an image.");
        return;
      }
      setBrief("");
      setAcknowledgeRestricted(false);
      setJustSavedRuleId(data.rule.id);
      setJustSavedStatus(data.rule.status);
      setMode("justSaved");
    } catch {
      setError("Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  async function callAction(ruleId: string, action: "approve" | "disable" | "enable") {
    setBusyRuleId(ruleId);
    try {
      await fetch(
        `/api/organizations/${organizationId}/content-elements/${element.id}/personalize/${ruleId}/${action}`,
        { method: "POST" },
      );
      onChanged();
    } finally {
      setBusyRuleId(null);
    }
  }

  async function removeRule(ruleId: string) {
    setBusyRuleId(ruleId);
    try {
      await fetch(
        `/api/organizations/${organizationId}/content-elements/${element.id}/personalize/${ruleId}`,
        { method: "DELETE" },
      );
      onChanged();
    } finally {
      setBusyRuleId(null);
      setConfirmingDeleteId(null);
    }
  }

  async function resolveJustSaved(turnOn: boolean) {
    if (turnOn && justSavedRuleId) {
      await callAction(justSavedRuleId, "approve");
    } else {
      onChanged();
    }
    setMode("closed");
    setJustSavedRuleId(null);
    setJustSavedStatus(null);
  }

  // The explicit, separate escape hatch product-spec.md §14 calls for.
  // null resets the element back to its type default
  // (src/lib/sites/boundaries.ts).
  async function updateBoundary(boundary: "ALLOWED" | "RESTRICTED" | "NEVER" | null) {
    setBoundarySaving(true);
    try {
      await fetch(`/api/organizations/${organizationId}/content-elements/${element.id}/boundary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary }),
      });
      onChanged();
    } finally {
      setBoundarySaving(false);
    }
  }

  const rules = element.personalizationRules;
  const hasLiveRule = rules.some((r) => r.status === "APPROVED");

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/40"
        >
          {hasLiveRule ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-positive)]" />
          ) : (
            <Sparkles size={13} />
          )}
          {rules.length > 0
            ? `Personalized for ${rules.length} ${rules.length === 1 ? "audience" : "audiences"}`
            : "Personalize this"}
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {element.boundary !== "ALLOWED" ? (
          <Badge variant="neutral" className="gap-1">
            {element.boundary === "NEVER" ? <Lock size={10} /> : <ShieldAlert size={10} />}
            {BOUNDARY_LABEL[element.boundary]}
          </Badge>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-col gap-1.5 border-b border-border pb-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">Personalization boundary</p>
              {boundarySaving ? <span className="text-xs text-muted">Saving…</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["ALLOWED", "RESTRICTED", "NEVER"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  disabled={boundarySaving}
                  onClick={() => updateBoundary(b)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    element.boundary === b
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-surface text-foreground hover:border-foreground/40"
                  }`}
                >
                  {BOUNDARY_LABEL[b]}
                </button>
              ))}
              {element.boundaryOverride !== null ? (
                <button
                  type="button"
                  disabled={boundarySaving}
                  onClick={() => updateBoundary(null)}
                  className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
                >
                  Use default
                </button>
              ) : null}
            </div>
            {element.boundary !== "ALLOWED" && element.boundaryOverride === null ? (
              <p className="text-xs text-muted">{boundaryReason(element.elementType)}</p>
            ) : null}
          </div>

          {rules.map((rule) => {
            const meta = STATUS_META[rule.status];
            const Icon = meta.icon;
            const isBusy = busyRuleId === rule.id;
            return (
              <div key={rule.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={meta.badge}>
                    <Icon size={12} className="mr-1" />
                    {meta.label}
                  </Badge>
                  <span
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
                    title={METHOD_LABEL[rule.method] ?? rule.method}
                  >
                    {METHOD_LABEL[rule.method] ?? rule.method}
                  </span>
                  <strong className="truncate text-foreground">{rule.audienceName}</strong>
                </div>
                <p className="mb-2 text-xs text-muted">{meta.note}</p>

                <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-background p-2 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Original</p>
                    <ContentPreview elementType={element.elementType} content={element.currentContent} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">This audience sees</p>
                    <ContentPreview elementType={element.elementType} content={rule.content} />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {confirmingDeleteId === rule.id ? (
                    <>
                      <p className="text-xs text-muted">Delete this? Visitors will go back to the default.</p>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={isBusy}
                        onClick={() => removeRule(rule.id)}
                        className="text-xs"
                      >
                        {isBusy ? "Deleting…" : "Yes, delete"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {rule.status === "PENDING" ? (
                        <Button
                          type="button"
                          variant="primary"
                          disabled={isBusy}
                          onClick={() => callAction(rule.id, "approve")}
                          className="gap-1.5 text-xs"
                        >
                          <Play size={13} />
                          {isBusy ? "Turning on…" : "Turn on"}
                        </Button>
                      ) : null}
                      {rule.status === "APPROVED" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => callAction(rule.id, "disable")}
                          className="gap-1.5 text-xs"
                        >
                          <Pause size={13} />
                          {isBusy ? "Pausing…" : "Pause"}
                        </Button>
                      ) : null}
                      {rule.status === "DISABLED" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => callAction(rule.id, "enable")}
                          className="gap-1.5 text-xs"
                        >
                          <Play size={13} />
                          {isBusy ? "Turning on…" : "Turn back on"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => setConfirmingDeleteId(rule.id)}
                        className="gap-1.5 text-xs"
                      >
                        <Trash2 size={13} />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {element.boundary === "NEVER" ? (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Lock size={13} />
                Never personalized
              </p>
              <p className="mt-1 text-xs text-muted">
                {boundaryReason(element.elementType) ?? "This element is marked as never personalize."}
              </p>
              <button
                type="button"
                disabled={boundarySaving}
                onClick={() => updateBoundary("ALLOWED")}
                className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-foreground"
              >
                Allow personalization for this element anyway
              </button>
            </div>
          ) : mode === "justSaved" ? (
            <div className="rounded-lg border border-border bg-surface p-3">
              {justSavedStatus === "APPROVED" ? (
                <>
                  <p className="text-sm font-medium text-foreground">Live.</p>
                  <p className="mt-1 text-xs text-muted">
                    Auto-approved — this site has AI auto-approval on for allowed content.
                  </p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => resolveJustSaved(false)}
                      className="text-xs"
                    >
                      Done
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">Saved.</p>
                  <p className="mt-1 text-xs text-muted">
                    Visitors won&apos;t see this yet — turn it on when you&apos;re ready.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => resolveJustSaved(true)}
                      className="gap-1.5 text-xs"
                    >
                      <Play size={13} />
                      Turn on now
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => resolveJustSaved(false)}
                      className="text-xs"
                    >
                      Not yet
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : mode === "adding" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
              {error ? <p className="text-xs text-danger">{error}</p> : null}

              <div>
                <p className="mb-1.5 text-xs font-medium text-foreground">Who should see this?</p>
                {audiences.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3">
                    <p className="text-xs text-muted">You need an audience before you can target this.</p>
                    <Link
                      href="/audiences"
                      className="mt-2 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
                    >
                      Create an audience
                    </Link>
                  </div>
                ) : (
                  <div role="radiogroup" aria-label="Who should see this?" className="flex flex-col gap-1.5">
                    {audiences.map((a) => {
                      const selected = audienceId === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setAudienceId(a.id)}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                            selected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background text-foreground hover:border-foreground/40"
                          }`}
                        >
                          <p className="text-xs font-medium">{a.name}</p>
                          {a.description ? (
                            <p className={`mt-0.5 text-xs ${selected ? "text-background/70" : "text-muted"}`}>
                              {a.description}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-foreground">What should they see?</p>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Original</p>
                <ContentPreview elementType={element.elementType} content={element.currentContent} />

                <div className="mt-2">
                  {isFromLibrary ? (
                    libraryOptions.length > 0 ? (
                      <>
                        <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
                          Pick from what&apos;s already on this site
                        </label>
                        <select
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        >
                          {libraryOptions.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        {IMAGE_TYPES.has(element.elementType) ? (
                          <ContentPreview elementType={element.elementType} content={content} />
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-muted">
                        No other {element.elementType === "CTA_HREF" ? "link" : "image"} found on this site yet
                        to personalize with.
                      </p>
                    )
                  ) : (
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  )}
                </div>
              </div>

              {IMAGE_TYPES.has(element.elementType) ? (
                <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
                  <label className="text-[10px] uppercase tracking-wide text-muted">
                    Or generate a new image with AI
                  </label>
                  <input
                    type="text"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="Optional brief, e.g. more enterprise-focused"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={generating || !audienceId || (element.boundary === "RESTRICTED" && !acknowledgeRestricted)}
                    onClick={generateImage}
                    className="gap-1.5 self-start text-xs"
                  >
                    <Sparkles size={13} />
                    {generating ? "Generating…" : "Generate new image"}
                  </Button>
                </div>
              ) : null}

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  <SlidersHorizontal size={12} />
                  Advanced options
                  <ChevronDown size={12} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>
                {showAdvanced ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      aria-label="Priority"
                    />
                    <p className="text-xs text-muted">
                      If this visitor matches more than one audience, the higher number wins.
                    </p>
                  </div>
                ) : null}
              </div>

              {element.boundary === "RESTRICTED" ? (
                <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/10 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-danger">
                    <ShieldAlert size={13} />
                    {boundaryReason(element.elementType) ?? "This kind of content is restricted by default."}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={acknowledgeRestricted}
                      onChange={(e) => setAcknowledgeRestricted(e.target.checked)}
                    />
                    I understand, personalize this anyway
                  </label>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={saving || !content || (element.boundary === "RESTRICTED" && !acknowledgeRestricted)}
                  onClick={addRule}
                  className="text-sm"
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMode("closed");
                    setAcknowledgeRestricted(false);
                  }}
                  className="text-sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode("adding")}
              className="gap-1.5 self-start text-sm"
            >
              <Plus size={14} />
              Show something different to an audience
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
