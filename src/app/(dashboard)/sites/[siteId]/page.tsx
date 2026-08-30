import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getSite } from "@/lib/sites/service";
import { listAudiences } from "@/lib/audiences/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { SiteDetail } from "@/components/sites/site-detail";

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

  const [site, audiences] = await Promise.all([
    getSite(organization.id, siteId),
    listAudiences(organization.id),
  ]);

  // Derived server-side (never window.location) so the embed snippet's
  // origin is correct on the very first render — no client-only effect,
  // no hydration mismatch to work around.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

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
