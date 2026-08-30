import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listCampaigns } from "@/lib/campaigns/service";
import { listPages } from "@/lib/pages/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsManager } from "@/components/campaigns/campaigns-manager";

export default async function CampaignsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const [campaigns, pages] = await Promise.all([
    listCampaigns(organization.id),
    listPages(organization.id),
  ]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Personalized vs. default, per page — simple 50/50 split, no statistical engine yet."
      />
      <CampaignsManager organizationId={organization.id} initialCampaigns={campaigns} pages={pages} />
    </>
  );
}
