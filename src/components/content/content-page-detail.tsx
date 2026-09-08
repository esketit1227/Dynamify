"use client";

import { useState, useMemo } from "react";
import { resolve } from "@dynamify/personalization-sdk";
import type { PageDefinition } from "@dynamify/personalization-sdk";
import { RenderedPreview } from "@/components/liveview/rendered-preview";
import { ReviewPanel } from "@/components/liveview/review-panel";
import type { ContentElementDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";
import type { Library } from "@/lib/sites/library";
import type { ContentPageSummaryDTO } from "@/lib/content/service";

// The detail-level "live view + annotations" the user asked for — no
// persona picker here (that stays Live View's distinct job); this always
// renders the real, default crawled content (resolve({}, definition), the
// same pipeline live-view.tsx already uses for its own "default visitor"
// reference panel) with every element clickable and annotated, so a
// freshly-crawled site with zero rules yet is just as browsable as one
// that's already personalized.
export function ContentPageDetail({
  organizationId,
  pageId,
  summary,
  initialDefinition,
  initialElements,
  initialAudiences,
  library,
}: {
  organizationId: string;
  pageId: string;
  summary: Pick<ContentPageSummaryDTO, "id" | "url" | "title" | "siteId" | "siteHostname">;
  initialDefinition: PageDefinition;
  initialElements: ContentElementDTO[];
  initialAudiences: AudienceDTO[];
  library: Library;
}) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [elements, setElements] = useState(initialElements);
  const [audiences, setAudiences] = useState(initialAudiences);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const resolved = useMemo(() => resolve({}, definition), [definition]);

  // getLiveViewDefinition's own query already filters personalizationRules
  // to status: APPROVED only (see src/lib/liveview/service.ts) — so a
  // nonempty array here already means "has a live rule." This page never
  // has a "pending" case to represent, hence only "none" | "approved" of
  // RenderedPreview's full three-state AnnotationStatus.
  const annotations = useMemo(() => {
    const map = new Map<string, { status: "none" | "approved" }>();
    for (const component of definition.components) {
      map.set(component.id, { status: component.personalizationRules.length > 0 ? "approved" : "none" });
    }
    return map;
  }, [definition]);

  const personalizedCount = elements.filter((el) =>
    el.personalizationRules.some((r) => r.status === "APPROVED"),
  ).length;
  const selectedElement = elements.find((el) => el.id === selectedElementId) ?? null;

  // Same refresh shape as live-view.tsx's refreshCurrentPage — one route,
  // already scoped by organizationId + pageId, already returns exactly
  // { definition, elements, audiences }.
  async function refresh() {
    const res = await fetch(`/api/organizations/${organizationId}/live-view/${pageId}`);
    if (!res.ok) return;
    const data = await res.json();
    setDefinition(data.definition);
    setElements(data.elements);
    setAudiences(data.audiences);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{summary.title ?? summary.url}</p>
          <p className="truncate text-xs text-muted">{summary.siteHostname}</p>
        </div>
        <span className="shrink-0 pl-3 text-xs text-muted">
          {personalizedCount} of {elements.length} elements personalized
        </span>
      </div>

      <RenderedPreview
        resolved={resolved}
        pageUrl={summary.url}
        onElementClick={setSelectedElementId}
        selectedComponentId={selectedElementId}
        annotations={annotations}
      />

      <ReviewPanel
        organizationId={organizationId}
        element={selectedElement}
        audiences={audiences}
        library={selectedElement ? (library[selectedElement.elementType] ?? []) : []}
        onClose={() => setSelectedElementId(null)}
        onChanged={refresh}
      />
    </div>
  );
}
