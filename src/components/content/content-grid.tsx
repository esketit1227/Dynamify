import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { sectionLabel } from "@/lib/format/labels";
import type { ContentPageSummaryDTO } from "@/lib/content/service";

// Real crawled content, styled as a mini page preview — deliberately not
// a fabricated visual thumbnail. CrawledPage has no screenshot to draw
// from, and this codebase has a strong, repeated ethos against ever
// showing something that looks more "real"/generated than it is (see
// PageDesignPreview's own comment on the same point). This renders the
// page's own real, default (unpersonalized — the grid has no visitor to
// resolve against) headline/subheadline/CTA as a small static layout,
// echoing RenderedPreview's visual language without literally mounting
// it: no animation, no click handling, no scroll — real, avoidable cost
// at grid scale (same reasoning PageDesignPreview's own header comment
// gives for not building on RenderedPreview either), just a smaller,
// presentational sibling.
function ContentPagePreview({ page }: { page: ContentPageSummaryDTO }) {
  if (!page.headline && !page.subheadline && !page.ctaLabel) {
    return (
      <p className="line-clamp-2 text-lg font-semibold text-foreground">{page.title ?? "Untitled page"}</p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {page.headline ? (
        <p className="line-clamp-2 text-lg font-semibold tracking-tight text-foreground">{page.headline}</p>
      ) : null}
      {page.subheadline ? <p className="line-clamp-2 text-sm text-muted">{page.subheadline}</p> : null}
      {page.ctaLabel ? (
        <span className="mt-0.5 inline-flex w-fit rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
          {page.ctaLabel}
        </span>
      ) : null}
    </div>
  );
}

function ContentPageCard({ page }: { page: ContentPageSummaryDTO }) {
  return (
    <Link
      href={`/content/${page.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-foreground/40"
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-background px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-1.5 truncate rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted">{page.url}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <ContentPagePreview page={page} />

        {page.sectionCounts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {page.sectionCounts.map(({ section, count }) => (
              <span
                key={section}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted"
              >
                {sectionLabel(section)} · {count}
              </span>
            ))}
          </div>
        ) : null}

        {page.personalizedElementCount > 0 ? (
          <Badge variant="positive" className="w-fit">
            {page.personalizedElementCount} personalizable
          </Badge>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-1 text-xs text-muted">
          <span>{page.siteHostname}</span>
          <span>
            {page.elementCount} {page.elementCount === 1 ? "element" : "elements"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ContentGrid({ pages }: { pages: ContentPageSummaryDTO[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((page) => (
        <ContentPageCard key={page.id} page={page} />
      ))}
    </div>
  );
}
