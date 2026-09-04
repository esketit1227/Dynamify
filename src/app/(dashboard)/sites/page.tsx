import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listSites } from "@/lib/sites/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConnectSiteForm } from "@/components/sites/connect-site-form";
import { SitesList } from "@/components/sites/sites-list";

export default async function SitesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const sites = await listSites(organization.id);

  return (
    <>
      <PageHeader
        title="Sites"
        description="Connect your existing website — we read it, understand it, and personalize it in place."
      />

      <div className="mb-6">
        <ConnectSiteForm organizationId={organization.id} />
      </div>

      <SitesList organizationId={organization.id} initialSites={sites} />
    </>
  );
}
