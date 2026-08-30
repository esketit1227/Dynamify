import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listLiveViewPages, getLiveViewDefinition } from "@/lib/liveview/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { LiveView } from "@/components/liveview/live-view";
import { EmptyState } from "@/components/ui/empty-state";

export default async function LiveViewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const pages = await listLiveViewPages(organization.id);
  const initialDefinition = pages[0] ? await getLiveViewDefinition(organization.id, pages[0].id) : null;

  return (
    <>
      <PageHeader
        title="Live View"
        description="Simulate a visitor — device, location, traffic source — and see exactly what they'd get."
      />
      {pages.length === 0 ? (
        <EmptyState
          title="Nothing to preview yet"
          description="Connect a site and let it finish reading before simulating visitors here."
        />
      ) : (
        <LiveView organizationId={organization.id} pages={pages} initialDefinition={initialDefinition} />
      )}
    </>
  );
}
