import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LandingPage } from "@/components/landing/landing-page";

export default async function RootPage() {
  const user = await getSessionUser();
  if (user) redirect("/overview");
  return <LandingPage />;
}
