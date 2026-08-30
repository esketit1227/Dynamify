import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { listMembers } from "@/lib/organizations/members";
import { PageHeader } from "@/components/dashboard/page-header";
import { RetentionSettingsForm } from "@/components/settings/retention-settings-form";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) redirect("/login");

  const members = await listMembers(organization.id);

  return (
    <>
      <PageHeader title="Settings" description="Organization details and members." />

      <div className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Organization</h2>
        <dl className="mt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Name</dt>
          <dd className="text-foreground">{organization.name}</dd>
          <dt className="text-muted">Slug</dt>
          <dd className="text-foreground">{organization.slug}</dd>
          <dt className="text-muted">Your role</dt>
          <dd className="text-foreground">{organization.role}</dd>
        </dl>
      </div>

      <div className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Members</h2>
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="text-foreground">{member.name ?? member.email}</p>
                {member.name ? <p className="text-xs text-muted">{member.email}</p> : null}
              </div>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                {member.role}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Inviting teammates isn&apos;t available yet.
        </p>
      </div>

      <div className="mb-8">
        <RetentionSettingsForm
          organizationId={organization.id}
          initialWindows={{
            rawEventRetentionDays: organization.rawEventRetentionDays,
            sessionRetentionDays: organization.sessionRetentionDays,
            visitorRetentionDays: organization.visitorRetentionDays,
          }}
        />
      </div>

      <div className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Audiences</h2>
        <p className="mb-3 text-xs text-muted">
          Groups of visitors defined by rules — used to target personalized content by element.
          Moved off the main navigation, still fully available.
        </p>
        <Link href="/audiences" className="text-sm font-medium text-foreground underline underline-offset-2">
          Manage audiences
        </Link>
      </div>
    </>
  );
}
