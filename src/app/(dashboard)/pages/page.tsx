import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listPages } from "@/lib/pages/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CreatePageForm } from "@/components/pages/create-page-form";

export default async function PagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const pages = await listPages(organization.id);

  return (
    <>
      <PageHeader
        title="Pages"
        description="Every personalized landing page in this organization."
        action={<CreatePageForm organizationId={organization.id} />}
      />

      {pages.length === 0 ? (
        <EmptyState
          title="No pages yet"
          description="Create your first page to get started — add components, personalize them for an audience, and publish."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {pages.map((page) => (
            <li key={page.id}>
              <Link
                href={`/pages/${page.id}/edit`}
                className="flex items-center justify-between px-4 py-3 hover:bg-background"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{page.name}</p>
                  <p className="text-xs text-muted">/{page.slug}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {page.isPublished ? "PUBLISHED" : page.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
