import Link from "next/link";

// Not built on the shared <Card> primitive (src/components/ui/card.tsx)
// — this needs to be an <a> for the whole surface to be clickable, and
// Card is deliberately a plain, non-polymorphic <div> for the common
// case. Class string kept identical to Card's for visual consistency.
export function FeaturedSiteCard({
  siteId,
  hostname,
  summary,
  pageCount,
  elementCount,
}: {
  siteId: string;
  hostname: string;
  summary: string;
  pageCount: number;
  elementCount: number;
}) {
  return (
    <Link
      href={`/sites/${siteId}`}
      className="flex flex-col rounded-2xl border border-border bg-surface p-6 transition-colors hover:bg-background"
    >
      <p className="text-sm text-muted">Featured site</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
          <span className="text-sm font-semibold">{hostname.charAt(0).toUpperCase()}</span>
        </div>
        <p className="font-medium text-foreground">{hostname}</p>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted">{summary}</p>
      <div className="mt-4 flex gap-6 border-t border-border pt-4 text-sm">
        <div>
          <p className="text-muted">Pages read</p>
          <p className="font-medium text-foreground">{pageCount}</p>
        </div>
        <div>
          <p className="text-muted">Elements found</p>
          <p className="font-medium text-foreground">{elementCount}</p>
        </div>
      </div>
    </Link>
  );
}
