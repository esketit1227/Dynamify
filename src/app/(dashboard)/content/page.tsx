import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listContentPages } from "@/lib/content/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentGrid } from "@/components/content/content-grid";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const { site: siteFilter } = await searchParams;
  const allPages = await listContentPages(organization.id);

  // One unfiltered fetch, filtered in memory — this data is metadata-sized
  // (bounded by crawl, not traffic), so a second DB round trip for the
  // filtered view buys nothing. Also builds the site-pill row below from
  // the same result, no extra query.
  const pages = siteFilter ? allPages.filter((p) => p.siteId === siteFilter) : allPages;
  const sites = [...new Map(allPages.map((p) => [p.siteId, p.siteHostname])).entries()];

  return (
    <>
      <PageHeader
        title="Content"
        description="Every page we've read, browsed visually — click one to see it live and personalize what's on it."
      />

      {sites.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/content"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              !siteFilter ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:border-foreground/40"
            }`}
          >
            All sites
          </Link>
          {sites.map(([siteId, hostname]) => (
            <Link
              key={siteId}
              href={`/content?site=${siteId}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                siteFilter === siteId
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:border-foreground/40"
              }`}
            >
              {hostname}
            </Link>
          ))}
        </div>
      ) : null}

      {pages.length === 0 ? (
        <EmptyState
          title="Nothing to browse yet"
          description="Connect a site and let it finish crawling — every page it finds shows up here, ready to view and personalize."
        />
      ) : (
        <ContentGrid pages={pages} />
      )}
    </>
  );
}
