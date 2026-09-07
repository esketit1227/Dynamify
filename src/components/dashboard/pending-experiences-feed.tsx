"use client";

import { useState } from "react";
import Link from "next/link";
import { ExperienceReview } from "@/components/recommendations/experience-review";
import type { GeneratedExperienceDTO } from "@/lib/sites/generateExperience";

// Home's entry point into the same review flow /recommendations offers —
// same ExperienceReview component, same live preview, same rewrite-before-
// approve affordance, just capped to the top few so Home stays a highlights
// view rather than a workqueue. Renders nothing once the list is empty
// (either there was never anything to review, or everything just got
// approved/rejected), rather than an empty-state card — Home already has a
// dedicated empty state for "no traffic yet" right below this.
export function PendingExperiencesFeed({
  organizationId,
  initialExperiences,
  totalCount,
}: {
  organizationId: string;
  initialExperiences: GeneratedExperienceDTO[];
  totalCount: number;
}) {
  const [experiences, setExperiences] = useState(initialExperiences);

  function updateOne(id: string, updated: GeneratedExperienceDTO | null) {
    setExperiences((prev) => (updated ? prev.map((e) => (e.id === id ? updated : e)) : prev.filter((e) => e.id !== id)));
  }

  if (experiences.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Ready for your review</h2>
          <p className="mt-1 text-sm text-muted">
            AI-drafted content waiting on your approval before it reaches a visitor.
          </p>
        </div>
        <Link href="/recommendations" className="text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground">
          View all{totalCount > experiences.length ? ` (${totalCount})` : ""}
        </Link>
      </div>

      {experiences.map((experience) => (
        <ExperienceReview
          key={experience.id}
          organizationId={organizationId}
          experience={experience}
          onChanged={(updated) => updateOne(experience.id, updated)}
        />
      ))}
    </div>
  );
}
