"use client";

import { useEffect, useRef, useState } from "react";
import { resolve } from "@dynamify/personalization-sdk";
import type { PageDefinition, ResolvedPage, RuleOperator, VisitorContext } from "@dynamify/personalization-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { VisitorProfileForm } from "@/components/liveview/visitor-profile-form";
import { WebsitePreview } from "@/components/liveview/website-preview";
import type { SiteDetailDTO } from "@/lib/sites/dto";

// Flattens a VisitorContext into one AudienceRule per set field, so the
// audience actually saved reflects everything the visitor-profile form
// captured (not just a hardcoded subset) — same ANDed groupIndex as before.
function contextToRules(
  context: VisitorContext,
): { field: string; operator: RuleOperator; value: unknown; groupIndex: number }[] {
  const rules: { field: string; operator: RuleOperator; value: unknown; groupIndex: number }[] = [];
  const add = (field: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    rules.push({ field, operator: "EQUALS", value, groupIndex: 0 });
  };

  add("device", context.device);
  add("geo.country", context.geo?.country);
  add("geo.region", context.geo?.region);
  add("geo.city", context.geo?.city);
  add("referrer", context.referrer);
  add("utm.source", context.utm?.source);
  add("utm.medium", context.utm?.medium);
  add("utm.campaign", context.utm?.campaign);
  add("utm.term", context.utm?.term);
  add("utm.content", context.utm?.content);
  if (context.returning) add("returning", true);
  add("sessionCount", context.sessionCount);
  for (const [key, value] of Object.entries(context.attributes ?? {})) {
    add(`attributes.${key}`, value);
  }

  return rules;
}

type Step =
  | "input"
  | "crawling"
  | "understanding"
  | "content-map"
  | "profile"
  | "personalizing"
  | "preview";

const UNDERSTANDING_LABELS = [
  "Reading headlines…",
  "Reading paragraphs…",
  "Finding CTAs…",
  "Finding images…",
  "Grouping into sections…",
  "Reading brand style…",
];

export function DemoWindow({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<SiteDetailDTO | null>(null);
  const [understandingLabelIndex, setUnderstandingLabelIndex] = useState(0);

  const contextRef = useRef<VisitorContext>({ device: "mobile" });
  const [appliedContext, setAppliedContext] = useState<VisitorContext | null>(null);

  const [suggestion, setSuggestion] = useState<{ content: string; method: "AI" | "HEURISTIC" } | null>(
    null,
  );
  const [resolved, setResolved] = useState<{ before: ResolvedPage; after: ResolvedPage } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const labelRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (labelRef.current) clearInterval(labelRef.current);
    };
  }, []);

  async function analyze() {
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't analyze that URL.");
        return;
      }
      setStep("crawling");
      pollStatus(data.site.id);
    } catch {
      setError("Something went wrong. Try again.");
    }
  }

  function pollStatus(id: string) {
    labelRef.current = setInterval(() => {
      setUnderstandingLabelIndex((i) => (i + 1) % UNDERSTANDING_LABELS.length);
    }, 1200);

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/organizations/${organizationId}/sites/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const s: SiteDetailDTO = data.site;

      if (s.status === "CRAWLING" || s.status === "PENDING") {
        setStep("crawling");
      } else if (s.status === "UNDERSTANDING") {
        setStep("understanding");
      } else if (s.status === "READY") {
        if (pollRef.current) clearInterval(pollRef.current);
        if (labelRef.current) clearInterval(labelRef.current);
        setSite(s);
        setStep("content-map");
      } else if (s.status === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current);
        if (labelRef.current) clearInterval(labelRef.current);
        setError(s.errorMessage ?? "Couldn't read this site.");
        setStep("input");
      }
    }, 1500);
  }

  const heroHeadline = site?.pages
    .flatMap((p) => p.elements)
    .find((el) => el.section === "HERO" && el.elementType === "HEADLINE");

  async function personalize() {
    if (!site || !heroHeadline) return;
    setError(null);
    setStep("personalizing");

    const context = contextRef.current;

    try {
      const rules = contextToRules(context);

      const audienceRes = await fetch(`/api/organizations/${organizationId}/audiences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Demo visitor — ${context.device ?? "unknown"}`, rules }),
      });
      const audienceData = await audienceRes.json();
      if (!audienceRes.ok) throw new Error(audienceData.error ?? "Couldn't create the audience.");

      const suggestRes = await fetch(
        `/api/organizations/${organizationId}/content-elements/${heroHeadline.id}/suggest-variant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context),
        },
      );
      const suggestData = await suggestRes.json();
      if (!suggestRes.ok) throw new Error(suggestData.error ?? "Couldn't suggest a variant.");
      setSuggestion(suggestData.suggestion);

      const personalizeRes = await fetch(
        `/api/organizations/${organizationId}/content-elements/${heroHeadline.id}/personalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audienceId: audienceData.audience.id,
            content: suggestData.suggestion.content,
            method: suggestData.suggestion.method,
            priority: 0,
          }),
        },
      );
      if (!personalizeRes.ok) {
        const d = await personalizeRes.json();
        throw new Error(d.error ?? "Couldn't save the personalization.");
      }
      const { rule } = await personalizeRes.json();

      // Every rule starts PENDING (docs/roadmap.md Phase 3: "nothing goes
      // live unapproved") — this guided, one-person flow has no separate
      // reviewer, so clicking "Personalize for this visitor" is itself the
      // approval.
      const approveRes = await fetch(
        `/api/organizations/${organizationId}/content-elements/${heroHeadline.id}/personalize/${rule.id}/approve`,
        { method: "POST" },
      );
      if (!approveRes.ok) {
        const d = await approveRes.json();
        throw new Error(d.error ?? "Couldn't approve the personalization.");
      }

      const page = site.pages[0];
      const defRes = await fetch(`/api/organizations/${organizationId}/live-view/${page.id}`);
      const defData = await defRes.json();
      const definition: PageDefinition = defData.definition;

      const before = resolve({}, definition);
      const after = resolve(context, definition);
      setResolved({ before, after });
      setAppliedContext(context);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("profile");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Live demo</h2>
          <button onClick={onClose} className="text-sm text-muted underline underline-offset-2">
            Close
          </button>
        </div>

        {step === "input" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Paste a real website URL to see the whole loop run.</p>
            <FormError message={error} />
            <Input
              type="url"
              placeholder="https://yourcompany.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button disabled={!url} onClick={analyze} className="self-start">
              Analyze Website
            </Button>
          </div>
        ) : null}

        {step === "crawling" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-sm font-medium text-foreground">AI crawls the page…</p>
            <p className="text-xs text-muted">Fetching {url}</p>
          </div>
        ) : null}

        {step === "understanding" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-sm font-medium text-foreground">Identifying content…</p>
            <p className="text-xs text-muted">{UNDERSTANDING_LABELS[understandingLabelIndex]}</p>
          </div>
        ) : null}

        {step === "content-map" && site ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Website Content Map</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  site.understanding?.method === "AI"
                    ? "border-transparent bg-[var(--status-positive)]/10 text-[var(--status-positive)]"
                    : "border-border text-muted"
                }`}
              >
                {site.understanding?.method === "AI" ? "AI-generated" : "Rule-based"}
              </span>
            </div>
            <p className="text-sm text-muted">
              Found {site.pageCount} {site.pageCount === 1 ? "page" : "pages"}, {site.elementCount}{" "}
              content elements.
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {["HERO", "FEATURES", "TESTIMONIALS", "CTA", "PRICING", "FAQ"].map((section) => {
                const count = site.pages
                  .flatMap((p) => p.elements)
                  .filter((el) => el.section === section).length;
                if (count === 0) return null;
                return (
                  <div key={section} className="rounded-lg border border-border px-3 py-2">
                    <p className="text-xs text-muted">{section}</p>
                    <p className="font-medium text-foreground">{count} found</p>
                  </div>
                );
              })}
            </div>
            {heroHeadline ? (
              <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <p className="text-xs text-muted">Hero headline</p>
                <p className="text-foreground">{heroHeadline.currentContent}</p>
              </div>
            ) : null}
            <p className="text-xs text-muted">
              Brand style:{" "}
              {site.understanding?.method === "AI"
                ? "available"
                : "needs AI — connect an API key for brand-voice analysis"}
            </p>
            <Button onClick={() => setStep("profile")} className="self-start">
              Choose a visitor to personalize for
            </Button>
          </div>
        ) : null}

        {step === "profile" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Choose a visitor profile</p>
            <FormError message={error} />
            <VisitorProfileForm
              initialDevice="mobile"
              onChange={(ctx) => (contextRef.current = ctx)}
            />
            <Button onClick={personalize} className="self-start">
              Personalize for this visitor
            </Button>
          </div>
        ) : null}

        {step === "personalizing" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-sm font-medium text-foreground">Personalizing…</p>
          </div>
        ) : null}

        {step === "preview" && resolved ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Live Personalized Preview</p>
              {suggestion ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    suggestion.method === "AI"
                      ? "border-transparent bg-[var(--status-positive)]/10 text-[var(--status-positive)]"
                      : "border-border text-muted"
                  }`}
                  title={
                    suggestion.method === "HEURISTIC"
                      ? "Re-selected from other real content already on this site"
                      : "Written by AI for this visitor profile"
                  }
                >
                  {suggestion.method === "AI" ? "AI-personalized" : "Rule-based suggestion"}
                </span>
              ) : null}
            </div>
            {site && appliedContext ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <WebsitePreview
                  organizationId={organizationId}
                  pageId={site.pages[0].id}
                  context={{}}
                  device={appliedContext.device}
                  label="Default visitor"
                />
                <WebsitePreview
                  organizationId={organizationId}
                  pageId={site.pages[0].id}
                  context={appliedContext}
                  device={appliedContext.device}
                  label="This visitor"
                />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 text-xs text-muted">Default visitor sees</p>
                <p className="text-foreground">
                  {(resolved.before.components.find((c) => c.id === heroHeadline?.id)?.content as { text?: string })
                    ?.text}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--status-positive)]/40 bg-[var(--status-positive)]/5 p-3">
                <p className="mb-1 text-xs text-muted">This visitor sees</p>
                <p className="text-foreground">
                  {(resolved.after.components.find((c) => c.id === heroHeadline?.id)?.content as { text?: string })
                    ?.text}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted">
              This is a real, saved personalization rule — find it again under Sites or Live View.
            </p>
            <Button variant="secondary" onClick={onClose} className="self-start">
              Done
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
