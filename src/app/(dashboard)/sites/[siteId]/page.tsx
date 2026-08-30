import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getSite, SiteNotFoundError } from "@/lib/sites/service";
import { listAudiences } from "@/lib/audiences/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { SiteDetail } from "@/components/sites/site-detail";
import { originFromHeaders } from "@/lib/http/origin";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  // A stale bookmark, a shared link to an already-removed site, or another
  // org's id all land here identically (getSite never distinguishes "gone"
  // from "not yours") — this is the deliberate 404 path for that, not the
  // generic error boundary. Anything else getSite could throw is a real
  // failure and still propagates to (dashboard)/error.tsx as before.
  const [site, audiences] = await Promise.all([
    getSite(organization.id, siteId).catch((error) => {
      if (error instanceof SiteNotFoundError) notFound();
      throw error;
    }),
    listAudiences(organization.id),
  ]);

  // Derived server-side (never window.location) so the embed snippet's
  // origin is correct on the very first render — no client-only effect,
  // no hydration mismatch to work around.
  const origin = originFromHeaders(await headers());

  return (
    <>
      <PageHeader title="Site" description={site.url} />
      <SiteDetail
        organizationId={organization.id}
        siteId={siteId}
        initialSite={site}
        audiences={audiences}
        origin={origin}
      />
    </>
  );
}
