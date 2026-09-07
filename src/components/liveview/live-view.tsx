"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { resolve } from "@dynamify/personalization-sdk";
import type { PageDefinition, ResolvedPage, VisitorContext } from "@dynamify/personalization-sdk";
import type { LiveViewPageOption } from "@/lib/liveview/service";
import { VisitorProfileForm } from "@/components/liveview/visitor-profile-form";
import { WebsitePreview } from "@/components/liveview/website-preview";
import { RenderedPreview } from "@/components/liveview/rendered-preview";
import { PersonaPresets, type PersonaPreset } from "@/components/liveview/persona-presets";
import { ElementPersonalize } from "@/components/sites/element-personalize";
import { LIBRARY_TYPES } from "@/components/sites/site-detail";
import { elementTypeLabel, sectionLabel } from "@/lib/format/labels";
import type { ContentElementDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

const DEFAULT_CONTEXT: VisitorContext = {};

// Per personalized component, the real reason it changed — which audience
// matched, at what priority — pulled from data already fetched (no new
// network call). Fulfills "full attribution: see what changed, why, and
// which signal triggered it," this product's own stated promise, which
// the old panel only half-delivered (a Personalized/Default badge with no
// "why").
type MatchReason = { audienceName: string; priority: number };

function findMatchReason(definition: PageDefinition, matchedRuleId: string): MatchReason | null {
  for (const component of definition.components) {
    const rule = component.personalizationRules.find((r) => r.id === matchedRuleId);
    if (!rule) continue;
    const audience = definition.audiences.find((a) => a.id === rule.audienceId);
    return { audienceName: audience?.name ?? "Unnamed audience", priority: rule.priority };
  }
  return null;
}

export function LiveView({
  organizationId,
  pages,
  initialDefinition,
  initialElements,
  initialAudiences,
}: {
  organizationId: string;
  pages: LiveViewPageOption[];
  initialDefinition: PageDefinition | null;
  initialElements: ContentElementDTO[];
  initialAudiences: AudienceDTO[];
}) {
  const [selectedPageId, setSelectedPageId] = useState(pages[0]?.id ?? "");
  const [definition, setDefinition] = useState<PageDefinition | null>(initialDefinition);
  const [loading, setLoading] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);

  // docs/launch-plan.md §5D — the in-context reviewer. `elements` carries
  // every rule status (unlike `definition`, which resolve() deliberately
  // only ever sees APPROVED rules through) so the review panel can show
  // pending drafts too, not just what's already live.
  const [elements, setElements] = useState<ContentElementDTO[]>(initialElements);
  const [audiences, setAudiences] = useState<AudienceDTO[]>(initialAudiences);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const contextRef = useRef<VisitorContext>(DEFAULT_CONTEXT);
  const [appliedContext, setAppliedContext] = useState<VisitorContext | null>(null);

  // The real live site is the primary preview, shown optimistically —
  // these flip to false only once a fetch actually confirms it couldn't
  // load (no real reachable URL, e.g. any fictional demo site, or the
  // fetch itself failing), at which point both panels fall back to the
  // synthesized preview together, not a mismatched real+synthesized pair.
  // Reset to null (unknown, assume available) on every new page/persona.
  const [defaultAvailable, setDefaultAvailable] = useState<boolean | null>(null);
  const [thisAvailable, setThisAvailable] = useState<boolean | null>(null);

  // Lazy initializer — pure computation from initialDefinition (already
  // fetched server-side), not a data-fetch-on-mount, so no effect needed.
  const [resolved, setResolved] = useState<ResolvedPage | null>(() =>
    initialDefinition ? resolve({}, initialDefinition) : null,
  );

  async function loadPage(pageId: string) {
    setSelectedPageId(pageId);
    setLoading(true);
    setResolved(null);
    setAppliedContext(null);
    setSelectedPersonaId(null);
    setDefaultAvailable(null);
    setThisAvailable(null);
    setSelectedElementId(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/live-view/${pageId}`);
      const data = await res.json();
      if (res.ok) {
        setDefinition(data.definition);
        setElements(data.elements);
        setAudiences(data.audiences);
      }
    } finally {
      setLoading(false);
    }
  }

  // The review panel's onChanged — after approving/disabling/adding a
  // rule, re-fetch this same page's full data and re-resolve against the
  // *current* persona (unlike loadPage, which is a page switch and resets
  // everything). The preview should reflect the edit immediately, not
  // require picking the persona again to see it.
  async function refreshCurrentPage() {
    const res = await fetch(`/api/organizations/${organizationId}/live-view/${selectedPageId}`);
    const data = await res.json();
    if (!res.ok) return;
    setDefinition(data.definition);
    setElements(data.elements);
    setAudiences(data.audiences);
    if (appliedContext) {
      setResolved(resolve(appliedContext, data.definition));
      setDefaultAvailable(null);
      setThisAvailable(null);
    }
  }

  function applyPersona(preset: PersonaPreset) {
    if (!definition) return;
    setResolved(resolve(preset.context, definition));
    setAppliedContext(preset.context);
    setSelectedPersonaId(preset.id);
    setDefaultAvailable(null);
    setThisAvailable(null);
  }

  function runResolve() {
    if (!definition) return;
    setResolved(resolve(contextRef.current, definition));
    setAppliedContext(contextRef.current);
    setSelectedPersonaId(null);
    setDefaultAvailable(null);
    setThisAvailable(null);
  }

  // The constant reference panel for the before/after comparison — always
  // the site's untouched default, recomputed only when the page itself
  // changes (not on every persona switch, since the default never varies
  // by persona).
  const defaultResolved = useMemo(() => (definition ? resolve({}, definition) : null), [definition]);

  // Same "approved asset library" principle as site-detail.tsx's
  // buildLibrary — real alternative content already found on the site,
  // never invented — scoped to just this page's own elements (Live View
  // only ever loads one page at a time), a narrower but still honest
  // subset of what the Sites page's site-wide picker offers.
  const library = useMemo(() => {
    const seen: Record<string, Set<string>> = {};
    for (const el of elements) {
      if (!LIBRARY_TYPES.has(el.elementType)) continue;
      (seen[el.elementType] ??= new Set()).add(el.currentContent);
    }
    const result: Record<string, string[]> = {};
    for (const [type, set] of Object.entries(seen)) result[type] = [...set];
    return result;
  }, [elements]);

  const matchReasons = useMemo(() => {
    if (!definition || !resolved) return new Map<string, MatchReason>();
    const map = new Map<string, MatchReason>();
    for (const component of resolved.components) {
      if (!component.matchedRuleId) continue;
      const reason = findMatchReason(definition, component.matchedRuleId);
      if (reason) map.set(component.id, reason);
    }
    return map;
  }, [definition, resolved]);

  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted">
        Connect a site and let it finish reading before simulating visitors here.
      </p>
    );
  }

  const currentPage = pages.find((p) => p.id === selectedPageId);
  const selectedElement = elements.find((el) => el.id === selectedElementId) ?? null;
  const changedComponents = resolved ? resolved.components.filter((c) => c.matchedVariantId) : [];
  // Optimistic until a fetch actually confirms otherwise — see the state
  // declarations above for why this only ever turns false, together.
  const showRealPreview = defaultAvailable !== false && thisAvailable !== false;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Page</label>
          <select
            value={selectedPageId}
            onChange={(e) => loadPage(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.url}
                {p.hasPersonalization ? " (personalized)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Simulate a visitor</p>
          <PersonaPresets selectedId={selectedPersonaId} onSelect={applyPersona} />
        </div>

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-muted hover:text-foreground"
          >
            Customize further
            <ChevronDown size={14} className={`transition-transform ${customizing ? "rotate-180" : ""}`} />
          </button>
          {customizing ? (
            <div className="mt-3">
              <VisitorProfileForm initialDevice="mobile" onChange={(ctx) => (contextRef.current = ctx)} />
              <button
                onClick={runResolve}
                disabled={!definition}
                className="mt-4 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                See what they&apos;d see
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">Loading…</p>
          </div>
        ) : !resolved || !appliedContext || !definition ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">Pick a visitor above and see what they&apos;d see.</p>
          </div>
        ) : (
          <>
            {changedComponents.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-4">
                <p className="text-sm text-foreground">
                  No personalization rule matched this visitor — the preview below shows the site&apos;s
                  default content.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Try a different persona, or check Sites for what audiences are configured.
                </p>
              </div>
            ) : null}

            {showRealPreview === false ? (
              <p className="text-xs text-muted">
                Showing a synthesized preview — this page isn&apos;t a real, publicly reachable URL, or it
                couldn&apos;t be loaded live. This reflects the same real content and exactly what this visitor
                would see.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {showRealPreview ? (
                <>
                  <WebsitePreview
                    organizationId={organizationId}
                    pageId={selectedPageId}
                    context={{}}
                    device={appliedContext.device}
                    label="Default visitor"
                    onAvailabilityChange={setDefaultAvailable}
                  />
                  <WebsitePreview
                    organizationId={organizationId}
                    pageId={selectedPageId}
                    context={appliedContext}
                    device={appliedContext.device}
                    label="This visitor"
                    onAvailabilityChange={setThisAvailable}
                  />
                </>
              ) : (
                <>
                  {defaultResolved ? (
                    <RenderedPreview
                      resolved={defaultResolved}
                      pageUrl={currentPage?.url ?? ""}
                      label="Default visitor"
                      onElementClick={setSelectedElementId}
                      selectedComponentId={selectedElementId}
                    />
                  ) : null}
                  <RenderedPreview
                    resolved={resolved}
                    pageUrl={currentPage?.url ?? ""}
                    label="This visitor"
                    onElementClick={setSelectedElementId}
                    selectedComponentId={selectedElementId}
                  />
                </>
              )}
            </div>
            {!showRealPreview ? (
              <p className="text-xs text-muted">Click anything above to review it or change it for this audience.</p>
            ) : null}

            {changedComponents.length > 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="mb-4 text-sm font-medium text-foreground">Why this changed</p>
                <AnimatePresence initial={false}>
                  <ul className="flex flex-col gap-3">
                    {changedComponents.map((component, index) => {
                      const reason = matchReasons.get(component.id);
                      const selected = selectedElementId === component.id;
                      return (
                        <motion.li
                          key={`${resolved.id}-${component.id}-${component.matchedVariantId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: 0.35 + index * 0.06 }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedElementId(component.id)}
                            aria-pressed={selected}
                            className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-background ${
                              selected ? "border-foreground ring-1 ring-foreground" : "border-border"
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-xs font-medium tracking-wide text-muted uppercase">
                                {elementTypeLabel(component.type)}
                              </span>
                              <span className="rounded-full border border-transparent bg-[var(--status-positive)]/10 px-2 py-0.5 text-xs text-[var(--status-positive)]">
                                Personalized
                              </span>
                            </div>
                            <p className="text-sm text-foreground">{(component.content as { text?: string }).text}</p>
                            {reason ? (
                              <p className="mt-1.5 text-xs text-muted">
                                Matched <span className="font-medium text-foreground">{reason.audienceName}</span>{" "}
                                (priority {reason.priority})
                              </p>
                            ) : null}
                            <p className="mt-1.5 text-xs text-muted underline underline-offset-2">
                              Review or change this
                            </p>
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                </AnimatePresence>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ReviewPanel
        organizationId={organizationId}
        element={selectedElement}
        audiences={audiences}
        library={selectedElement ? (library[selectedElement.elementType] ?? []) : []}
        onClose={() => setSelectedElementId(null)}
        onChanged={refreshCurrentPage}
      />
    </div>
  );
}

// docs/launch-plan.md §5D — the actual "click it, review it right there"
// surface: reuses ElementPersonalize (src/components/sites/element-
// personalize.tsx) wholesale rather than a second review UI — that widget
// already does approve/pause/delete/add-a-rule correctly; this just gives
// it a place to appear next to what you clicked instead of a flat list you
// have to go find on the Sites page.
function ReviewPanel({
  organizationId,
  element,
  audiences,
  library,
  onClose,
  onChanged,
}: {
  organizationId: string;
  element: ContentElementDTO | null;
  audiences: AudienceDTO[];
  library: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <AnimatePresence>
      {element ? (
        <>
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
            aria-label="Review this element"
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
                  {sectionLabel(element.section)}
                </p>
                <h2 className="text-sm font-semibold text-foreground">{elementTypeLabel(element.elementType)}</h2>
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
            <p className="mb-4 rounded-lg border border-border bg-background p-2.5 text-sm text-foreground">
              {element.currentContent}
            </p>
            <ElementPersonalize
              organizationId={organizationId}
              element={element}
              audiences={audiences}
              library={library}
              onChanged={onChanged}
            />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
