import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getContentPageSummary, getSiteWideImageLibrary } from "@/lib/content/service";
import { getLiveViewDefinition, getLiveViewPageElements, CrawledPageNotFoundError } from "@/lib/liveview/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentPageDetail } from "@/components/content/content-page-detail";

export default async function ContentPageDetailPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  // A stale bookmark, a shared link to a removed page, or another org's id
  // all land here identically — same 404-not-error-boundary posture as
  // sites/[siteId]/page.tsx.
  const summary = await getContentPageSummary(organization.id, pageId).catch((error) => {
    if (error instanceof CrawledPageNotFoundError) notFound();
    throw error;
  });

  const [definition, pageElements] = await Promise.all([
    getLiveViewDefinition(organization.id, pageId),
    getLiveViewPageElements(organization.id, pageId),
  ]);
  const library = await getSiteWideImageLibrary(organization.id, summary.siteId);

  return (
    <>
      <PageHeader title={summary.title ?? summary.url} description={summary.url} />
      <ContentPageDetail
        organizationId={organization.id}
        pageId={pageId}
        summary={summary}
        initialDefinition={definition}
        initialElements={pageElements.elements}
        initialAudiences={pageElements.audiences}
        library={library}
      />
    </>
  );
}
