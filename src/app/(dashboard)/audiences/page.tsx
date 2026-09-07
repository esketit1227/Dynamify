import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listAudiences } from "@/lib/audiences/service";
import { getPendingAudienceProposal } from "@/lib/ai/proposals";
import { PageHeader } from "@/components/dashboard/page-header";
import { AudiencesManager } from "@/components/audiences/audiences-manager";

export default async function AudiencesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const [audiences, pendingProposal] = await Promise.all([
    listAudiences(organization.id),
    getPendingAudienceProposal(organization.id),
  ]);

  return (
    <>
      <PageHeader
        title="Audiences"
        description="Groups of visitors defined by rules — who sees what."
      />
      <AudiencesManager
        organizationId={organization.id}
        initialAudiences={audiences}
        initialProposal={pendingProposal}
      />
    </>
  );
}
