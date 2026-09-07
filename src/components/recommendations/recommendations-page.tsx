"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { RecommendationDTO } from "@/lib/recommendations/service";
import type { ConvertingPageCandidateDTO } from "@/lib/recommendations/convertingPages";
import type { PageDesignCandidateDTO } from "@/lib/sites/designPage";
import { PageDesignReview } from "@/components/recommendations/page-design-review";
import { ExperienceReview } from "@/components/recommendations/experience-review";

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

// The crawl-only counterpart to RecommendationRow: no traffic, no accept/
// ignore decision — a page is either not-yet-generated (show the button) or
// already has a real experience to review (show it, same ExperienceReview
// component the traffic-triggered path uses).
function ConvertingPageRow({
  organizationId,
  candidate,
  onChanged,
}: {
  organizationId: string;
  candidate: ConvertingPageCandidateDTO;
  onChanged: (updated: ConvertingPageCandidateDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/converting-pages/${candidate.crawledPageId}/generate`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onChanged({ ...candidate, experience: data.experience });
      } else {
        setError(data?.error ?? "Couldn't generate a converting page for this one. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-foreground">{candidate.pageTitle ?? candidate.pageUrl}</p>
          <p className="mt-0.5 text-xs text-muted">{candidate.siteUrl}</p>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {candidate.experience ? (
        <ExperienceReview
          organizationId={organizationId}
          experience={candidate.experience}
          onChanged={(experience) => onChanged({ ...candidate, experience })}
        />
      ) : (
        <div className="mt-3">
          <Button variant="secondary" disabled={busy} onClick={generate}>
            <Sparkles size={14} className="mr-1.5" />
            {busy ? "Generating…" : "Generate a converting page"}
          </Button>
        </div>
      )}
    </div>
  );
}

// The whole-new-page counterpart to ConvertingPageRow: no traffic, no
// audience, no delivery — a page either has no design yet (show the
// button) or has one to review (show it). See docs/decisions.md D8.
function PageDesignRow({
  organizationId,
  candidate,
  onChanged,
}: {
  organizationId: string;
  candidate: PageDesignCandidateDTO;
  onChanged: (updated: PageDesignCandidateDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/page-designs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawledPageId: candidate.crawledPageId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onChanged({ ...candidate, design: data.design });
      } else {
        setError(data?.error ?? "Couldn't design a new page for this one. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-foreground">{candidate.pageTitle ?? candidate.pageUrl}</p>
          <p className="mt-0.5 text-xs text-muted">{candidate.siteUrl}</p>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {candidate.design ? (
        <PageDesignReview
          organizationId={organizationId}
          design={candidate.design}
          onChanged={(design) => onChanged({ ...candidate, design })}
        />
      ) : (
        <div className="mt-3">
          <Button variant="secondary" disabled={busy} onClick={generate}>
            <Sparkles size={14} className="mr-1.5" />
            {busy ? "Designing…" : "Design a new page"}
          </Button>
        </div>
      )}
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
  initialConvertingPageCandidates,
  initialPageDesignCandidates,
}: {
  organizationId: string;
  initialRecommendations: RecommendationDTO[];
  initialConvertingPageCandidates: ConvertingPageCandidateDTO[];
  initialPageDesignCandidates: PageDesignCandidateDTO[];
}) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [generating, setGenerating] = useState(false);
  const [convertingPages, setConvertingPages] = useState(initialConvertingPageCandidates);
  const [pageDesigns, setPageDesigns] = useState(initialPageDesignCandidates);

  function updateOne(updated: RecommendationDTO) {
    setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function updateOneConvertingPage(updated: ConvertingPageCandidateDTO) {
    setConvertingPages((prev) => prev.map((c) => (c.crawledPageId === updated.crawledPageId ? updated : c)));
  }

  function updateOnePageDesign(updated: PageDesignCandidateDTO) {
    setPageDesigns((prev) => prev.map((c) => (c.crawledPageId === updated.crawledPageId ? updated : c)));
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Converting pages from your crawl</h2>
          <p className="mt-1 text-sm text-muted">
            No traffic required — built entirely from what we learned crawling your site. Targets mobile
            visitors, the one segment every connected site can reach from day one, no visitor history needed.
          </p>
        </div>

        {convertingPages.length === 0 ? (
          <EmptyState
            title="Nothing to generate yet"
            description="Connect a site and let it finish crawling — every crawled page shows up here, ready to generate a converting version of it."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {convertingPages.map((candidate) => (
              <ConvertingPageRow
                key={candidate.crawledPageId}
                organizationId={organizationId}
                candidate={candidate}
                onChanged={updateOneConvertingPage}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">Recommendations</h2>
            <p className="mt-1 text-sm text-muted">
              Segments where a clear share of your real traffic shares a trait — accept one to target it and
              automatically generate a coordinated set of content for it.
            </p>
          </div>
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

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Design a new page</h2>
          <p className="mt-1 text-sm text-muted">
            A brand-new page designed from scratch out of what we already know about your site.{" "}
            <span className="font-medium text-foreground">Nothing here goes live.</span> Dynamify never
            changes your site&apos;s layout — this is a direction to review, endorse, and hand to whoever builds
            your pages.
          </p>
        </div>

        {pageDesigns.length === 0 ? (
          <EmptyState
            title="Nothing to design yet"
            description="Connect a site and let it finish crawling — every crawled page shows up here, ready to design a new version of it."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pageDesigns.map((candidate) => (
              <PageDesignRow
                key={candidate.crawledPageId}
                organizationId={organizationId}
                candidate={candidate}
                onChanged={updateOnePageDesign}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
