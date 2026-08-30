import { Plus_Jakarta_Sans } from "next/font/google";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLogos } from "@/components/landing/landing-logos";
import { LandingDemo } from "@/components/landing/landing-demo";
import { LandingHow } from "@/components/landing/landing-how";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingImpact } from "@/components/landing/landing-impact";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CookieBanner } from "@/components/landing/cookie-banner";
import "@/components/landing/landing.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Ported from a Claude Design handoff (design-time interactivity —
// hero tab switching, the demo audience switcher, the cookie banner —
// rebuilt as real React state rather than the prototype's own runtime).
// Deliberately its own visual language (Plus Jakarta Sans, its own fixed
// light palette) rather than the dashboard's theme tokens — a marketing
// page, not another dashboard screen.
export function LandingPage() {
  return (
    <div className={`landing-page relative w-full overflow-x-hidden bg-[#f0eff3] text-[#111014] ${plusJakartaSans.className}`}>
      <LandingNav />
      <LandingHero />
      <LandingLogos />
      <LandingDemo />
      <LandingHow />
      <LandingFeatures />
      <LandingImpact />
      <LandingPricing />
      <LandingCta />
      <LandingFooter />
      <CookieBanner />
    </div>
  );
}
