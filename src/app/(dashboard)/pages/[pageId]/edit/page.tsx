import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { getPageDetail } from "@/lib/pages/service";
import { listAudiences } from "@/lib/audiences/service";
import { PageEditor } from "@/components/pages/page-editor";

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const [page, audiences] = await Promise.all([
    getPageDetail(organization.id, pageId),
    listAudiences(organization.id),
  ]);

  return (
    <PageEditor
      organizationId={organization.id}
      pageId={pageId}
      initialPage={page}
      initialAudiences={audiences}
    />
  );
}
