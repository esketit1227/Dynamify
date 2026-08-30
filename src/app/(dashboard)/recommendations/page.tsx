import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listAllRecommendations } from "@/lib/recommendations/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { RecommendationsPage } from "@/components/recommendations/recommendations-page";

export default async function Recommendations() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const recommendations = await listAllRecommendations(organization.id);

  return (
    <>
      <PageHeader
        title="Recommendations"
        description="Real visitor segments worth targeting, across every connected site."
      />
      <RecommendationsPage organizationId={organization.id} initialRecommendations={recommendations} />
    </>
  );
}
