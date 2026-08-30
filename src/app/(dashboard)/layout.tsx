import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const organization = await getCurrentOrgForUser(user.id);
  if (!organization) {
    // Shouldn't happen — signup always creates a membership in the same
    // transaction — but render defaults rather than crash if it ever does.
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar organizationName={organization.name} userEmail={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
