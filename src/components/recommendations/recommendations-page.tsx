"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RenderedPreview } from "@/components/liveview/rendered-preview";
import type { ResolvedPage } from "@dynamify/personalization-sdk";
import type { RecommendationDTO } from "@/lib/recommendations/service";
import type { GeneratedExperienceDTO } from "@/lib/sites/generateExperience";

const FIELD_LABEL: Record<string, string> = {
  device: "device",
  "geo.country": "country",
  "utm.source": "utm.source",
  "utm.medium": "utm.medium",
  "utm.campaign": "utm.campaign",
  referrer: "referrer domain",
};

function describeSegment(rec: RecommendationDTO): string {
  const pct = Math.round(rec.share * 100);
  const page = rec.pageTitle ?? rec.pageUrl;
  return `${pct}% of visitors to ${page} match ${FIELD_LABEL[rec.field] ?? rec.field} = "${rec.value}"`;
}

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

function ExperienceReview({
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
              <li key={rule.id} className="rounded-md border border-border bg-surface p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>{METHOD_LABEL[rule.method] ?? rule.method}</span>
                  <Badge variant={RULE_STATUS_BADGE[rule.status] ?? "neutral"}>
                    {RULE_STATUS_LABEL[rule.status] ?? rule.status}
                  </Badge>
                </div>
                <p className="truncate text-foreground">{rule.content}</p>
              </li>
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

function RecommendationRow({
  organizationId,
  recommendation,
  onChanged,
}: {
  organizationId: string;
  recommendation: RecommendationDTO;
  onChanged: (updated: RecommendationDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/recommendations/${recommendation.id}/accept`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onChanged({
          ...recommendation,
          status: "ACCEPTED",
          experience: data.experience,
        });
        if (!data.experience && data.experienceError) setError(data.experienceError);
      } else {
        setError(data?.error ?? "Couldn't accept this recommendation. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function ignore() {
    setBusy(true);
    try {
      await fetch(`/api/organizations/${organizationId}/recommendations/${recommendation.id}/ignore`, {
        method: "POST",
      });
      onChanged({ ...recommendation, status: "IGNORED" });
    } finally {
      setBusy(false);
    }
  }

  async function retryGenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/recommendations/${recommendation.id}/generate-experience`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onChanged({ ...recommendation, experience: data.experience });
      } else {
        setError(data?.error ?? "Couldn't generate content for this segment. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (recommendation.status === "IGNORED") return null;

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-foreground">{describeSegment(recommendation)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {recommendation.siteUrl} · {recommendation.matchingEvents} of {recommendation.totalEvents} views
          </p>
        </div>
        {recommendation.status === "ACCEPTED" ? <Badge variant="positive">Accepted</Badge> : null}
      </div>

      {recommendation.status === "PENDING" ? (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button disabled={busy} onClick={accept} className="text-muted underline underline-offset-2 disabled:opacity-50">
            {busy ? "Accepting…" : "Accept — target this segment and generate a full experience"}
          </button>
          <button disabled={busy} onClick={ignore} className="text-muted underline underline-offset-2 disabled:opacity-50">
            Ignore
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {recommendation.status === "ACCEPTED" ? (
        recommendation.experience ? (
          <ExperienceReview
            organizationId={organizationId}
            experience={recommendation.experience}
            onChanged={(experience) => onChanged({ ...recommendation, experience })}
          />
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3">
            <p className="text-xs text-muted">
              No content generated for this segment yet.
            </p>
            <Button variant="secondary" className="mt-2" disabled={busy} onClick={retryGenerate}>
              <Sparkles size={14} className="mr-1.5" />
              {busy ? "Generating…" : "Generate a full experience"}
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

// docs/roadmap.md: recommendations and the full-experience generator live
// in one place now — accepting a recommendation (real traffic clustering
// that cleared both thresholds) both targets the segment and tries to
// generate a coordinated content bundle for it automatically, reviewed
// right here rather than in a separate section.
export function RecommendationsPage({
  organizationId,
  initialRecommendations,
}: {
  organizationId: string;
  initialRecommendations: RecommendationDTO[];
}) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [generating, setGenerating] = useState(false);

  function updateOne(updated: RecommendationDTO) {
    setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/recommendations`, { method: "POST" });
      if (res.ok) setRecommendations((await res.json()).recommendations);
    } finally {
      setGenerating(false);
    }
  }

  const visible = recommendations.filter((r) => r.status !== "IGNORED");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Segments where a clear share of your real traffic shares a trait — accept one to target it and
          automatically generate a coordinated set of content for it.
        </p>
        <Button disabled={generating} onClick={generate} className="shrink-0">
          {generating ? "Checking…" : "Check for recommendations"}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Once your connected sites' embed scripts have collected enough page views, segments worth targeting will show up here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((rec) => (
            <RecommendationRow
              key={rec.id}
              organizationId={organizationId}
              recommendation={rec}
              onChanged={updateOne}
            />
          ))}
        </div>
      )}
    </div>
  );
}
