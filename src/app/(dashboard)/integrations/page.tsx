import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listWebhooks } from "@/lib/integrations/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { WebhooksManager } from "@/components/integrations/webhooks-manager";

export default async function IntegrationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const webhooks = await listWebhooks(organization.id);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Send personalization and conversion events to your own systems as they happen."
      />
      <WebhooksManager organizationId={organization.id} initialWebhooks={webhooks} />
    </>
  );
}
