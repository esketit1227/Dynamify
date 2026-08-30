"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { resolve } from "@dynamify/personalization-sdk";
import type { PageDefinition, ResolvedPage, VisitorContext } from "@dynamify/personalization-sdk";
import type { LiveViewPageOption } from "@/lib/liveview/service";
import { VisitorProfileForm } from "@/components/liveview/visitor-profile-form";
import { WebsitePreview } from "@/components/liveview/website-preview";
import { RenderedPreview } from "@/components/liveview/rendered-preview";
import { PersonaPresets, type PersonaPreset } from "@/components/liveview/persona-presets";

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
}: {
  organizationId: string;
  pages: LiveViewPageOption[];
  initialDefinition: PageDefinition | null;
}) {
  const [selectedPageId, setSelectedPageId] = useState(pages[0]?.id ?? "");
  const [definition, setDefinition] = useState<PageDefinition | null>(initialDefinition);
  const [loading, setLoading] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);

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
    try {
      const res = await fetch(`/api/organizations/${organizationId}/live-view/${pageId}`);
      const data = await res.json();
      if (res.ok) {
        setDefinition(data.definition);
      }
    } finally {
      setLoading(false);
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
                    <RenderedPreview resolved={defaultResolved} pageUrl={currentPage?.url ?? ""} label="Default visitor" />
                  ) : null}
                  <RenderedPreview resolved={resolved} pageUrl={currentPage?.url ?? ""} label="This visitor" />
                </>
              )}
            </div>

            {changedComponents.length > 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="mb-4 text-sm font-medium text-foreground">Why this changed</p>
                <AnimatePresence initial={false}>
                  <ul className="flex flex-col gap-3">
                    {changedComponents.map((component, index) => {
                      const reason = matchReasons.get(component.id);
                      return (
                        <motion.li
                          key={`${resolved.id}-${component.id}-${component.matchedVariantId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: 0.35 + index * 0.06 }}
                          className="rounded-lg border border-border p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium tracking-wide text-muted uppercase">
                              {component.type}
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
    </div>
  );
}
