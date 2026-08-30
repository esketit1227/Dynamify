import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listSiteVisitors } from "@/lib/visitors/service";
import { listSites } from "@/lib/sites/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { VisitorsTable } from "@/components/visitors/visitors-table";

export default async function VisitorsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const [visitors, sites] = await Promise.all([
    listSiteVisitors(organization.id),
    listSites(organization.id),
  ]);
  const anyTrackingEnabled = sites.some((site) => site.visitorTrackingEnabled);

  return (
    <>
      <PageHeader
        title="Visitors"
        description="Individually tracked visitors — opt-in per site. Intent and stage are an inferred heuristic, not a measurement."
      />

      {visitors.length === 0 ? (
        <EmptyState
          title="No visitors yet"
          description={
            anyTrackingEnabled
              ? "Visitor tracking is on, but no visitor has been recorded yet. Rows appear here once someone loads a page on a tracked site."
              : "Visitor tracking is off for every site. Turn it on for a site to start recognizing returning visitors individually — off by default, and worth reading the disclosure note before you do."
          }
          action={
            <Link href="/sites" className="text-sm font-medium text-foreground underline underline-offset-2">
              Go to Sites
            </Link>
          }
        />
      ) : (
        <VisitorsTable organizationId={organization.id} visitors={visitors} />
      )}
    </>
  );
}
