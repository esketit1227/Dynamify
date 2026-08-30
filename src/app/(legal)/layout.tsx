import Link from "next/link";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#fdfdfe]">
      <header className="px-6 pt-6">
        <div className="mx-auto flex max-w-[720px] items-center justify-between">
          <Link
            href="/"
            className="text-[17px] font-extrabold tracking-[-.045em] text-[#111014] no-underline"
          >
            Dynamify
          </Link>
          <Link
            href="/"
            className="text-[14.5px] font-semibold tracking-[-.02em] text-[#56545e] no-underline transition-colors hover:text-[#111014]"
          >
            ← Back home
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <LandingFooter />
    </div>
  );
}
