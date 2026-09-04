import { Figtree } from "next/font/google";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLogos } from "@/components/landing/landing-logos";
import { LandingDemo } from "@/components/landing/landing-demo";
import { LandingHow } from "@/components/landing/landing-how";
import { LandingPrinciples } from "@/components/landing/landing-principles";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingImpact } from "@/components/landing/landing-impact";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CookieBanner } from "@/components/landing/cookie-banner";
import { Reveal } from "@/components/landing/reveal";
import "@/components/landing/landing.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Ported from a Claude Design handoff (design-time interactivity —
// hero tab switching, the demo audience switcher, the cookie banner —
// rebuilt as real React state rather than the prototype's own runtime).
// Deliberately its own visual language (Figtree, its own fixed light
// palette — see landing.css's :root token block) rather than the
// dashboard's theme tokens — a marketing page, not another dashboard screen.
export function LandingPage() {
  return (
    <div className={`landing-page relative w-full overflow-x-hidden bg-[var(--lp-bg)] text-[var(--lp-text)] ${figtree.className}`}>
      <LandingNav />
      <LandingHero />
      <Reveal><LandingLogos /></Reveal>
      <Reveal><LandingDemo /></Reveal>
      <LandingHow />
      <Reveal><LandingPrinciples /></Reveal>
      <Reveal><LandingFeatures /></Reveal>
      <Reveal><LandingImpact /></Reveal>
      <Reveal><LandingPricing /></Reveal>
      <Reveal><LandingCta /></Reveal>
      <Reveal><LandingFooter /></Reveal>
      <CookieBanner />
    </div>
  );
}
