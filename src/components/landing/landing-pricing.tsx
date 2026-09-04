"use client";

import { useState } from "react";
import Link from "next/link";

// Real tiers, built around what's actually shipped — no ecommerce/Shopify
// (still just a foundation layer, see docs/ecommerce.md), no SSO or team
// seats outside Enterprise (neither is built for self-serve — team invites
// aren't built at all yet), no CRM connectors (spec only). Usage-based
// differentiation (sites, tracked page views/mo) rather than one flat
// price for every site size, since the product's own cost to run scales
// with traffic, not just the invoice. Two fixed-price tiers plus a custom
// Enterprise tier — not three self-serve tiers — since a real conversation
// is the honest way to sell something this configurable at high volume,
// not a third price picked in advance.
const ANNUAL_DISCOUNT_MONTHS = 2; // "2 months free" — the standard framing this maps to

type Tier = {
  name: string;
  monthly: number | null; // null = Custom, no numeric price
  tagline: string;
  cta: string;
  href: string;
  highlight: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    monthly: 49,
    tagline: "Validate the idea on one site.",
    cta: "Start free",
    href: "/signup",
    highlight: false,
    features: [
      "1 connected site",
      "Up to 5,000 tracked page views/mo included",
      "Unlimited audiences & personalization rules",
      "Full-experience generator & recommendations",
      "Live View simulator",
      "Generic vs. personalized analytics",
    ],
  },
  {
    name: "Growth",
    monthly: 199,
    tagline: "For teams running personalization at scale.",
    cta: "Start free",
    href: "/signup",
    highlight: true,
    features: [
      "Up to 5 connected sites",
      "Up to 50,000 tracked page views/mo included",
      "Everything in Starter, plus:",
      "Behavioral visitor tracking (intent & stage)",
      "A/B holdout & causal-lift measurement",
      "Webhook delivery to your own systems",
      "IP-based company enrichment",
    ],
  },
  {
    name: "Enterprise",
    monthly: null,
    tagline: "High-traffic sites, multiple brands, custom needs.",
    cta: "Talk to us",
    href: "#cta",
    highlight: false,
    features: [
      "Unlimited sites, custom volume",
      "Everything in Growth, plus:",
      "SSO & a custom security review",
      "Dedicated onboarding & support",
      "Custom contract & invoicing",
    ],
  },
];

function annualMonthlyEquivalent(monthly: number): number {
  return Math.round((monthly * (12 - ANNUAL_DISCOUNT_MONTHS)) / 12);
}
function annualTotal(monthly: number): number {
  return monthly * (12 - ANNUAL_DISCOUNT_MONTHS);
}

export function LandingPricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="px-6 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="m-0 max-w-[560px] text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em] text-balance">
            Simple pricing, <span className="text-[#6b6875]">sized to your traffic.</span>
          </h2>
          <p className="m-0 max-w-[360px] text-[16.5px] leading-[1.5] tracking-[-.02em] text-[#a5a2ae] text-pretty">
            Every plan gets the full engine — priority/specificity resolution, brand-safety-checked AI
            content, nothing goes live unapproved. Plans differ by volume, not capability tiers hidden
            behind a paywall.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full bg-[#1b1a20] p-1 ring-1 ring-[#2a2830]">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              aria-pressed={!annual}
              className={`rounded-full px-5 py-2 text-sm font-bold tracking-[-.01em] transition-colors ${
                !annual ? "bg-[#f5f4f7] text-[#121116]" : "text-[#a5a2ae] hover:text-[#f5f4f7]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold tracking-[-.01em] transition-colors ${
                annual ? "bg-[#f5f4f7] text-[#121116]" : "text-[#a5a2ae] hover:text-[#f5f4f7]"
              }`}
            >
              Annual
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  annual ? "bg-[#121116]/10 text-[#121116]" : "bg-[#f5f4f7]/10 text-[#a5a2ae]"
                }`}
              >
                2 months free
              </span>
            </button>
          </div>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => {
            const displayPrice =
              tier.monthly === null ? "Custom" : annual ? annualMonthlyEquivalent(tier.monthly) : tier.monthly;

            return (
              <div
                key={tier.name}
                className={`flex flex-col rounded-[20px] p-[30px] ${
                  tier.highlight ? "bg-[#f5f4f7] text-[#121116]" : "bg-[#1b1a20] text-[#f5f4f7] ring-1 ring-[#2a2830]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xl font-bold tracking-[-.038em]">{tier.name}</div>
                  {tier.highlight ? (
                    <span className="rounded-full bg-[#121116]/10 px-2.5 py-1 text-[11px] font-bold tracking-[-.01em] text-[#121116]">
                      Most popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex items-baseline gap-1.5">
                  {tier.monthly === null ? (
                    <span className="text-[clamp(36px,3.6vw,48px)] leading-none font-bold tracking-[-.05em]">
                      Custom
                    </span>
                  ) : (
                    <>
                      <span className="text-[clamp(36px,3.6vw,48px)] leading-none font-bold tracking-[-.05em]">
                        ${displayPrice}
                      </span>
                      <span className={`text-sm ${tier.highlight ? "text-[#6b6975]" : "text-[#83808c]"}`}>/mo</span>
                    </>
                  )}
                </div>
                <p className={`mt-1 text-[13px] ${tier.highlight ? "text-[#6b6975]" : "text-[#83808c]"}`}>
                  {tier.monthly !== null
                    ? annual
                      ? `Billed annually at $${annualTotal(tier.monthly).toLocaleString()}/yr`
                      : "Billed monthly, cancel anytime"
                    : "Volume, terms, and support built around your rollout"}
                </p>
                <p className={`mt-2 text-[15px] leading-[1.4] tracking-[-.018em] ${tier.highlight ? "text-[#45424c]" : "text-[#c2bfcb]"}`}>
                  {tier.tagline}
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className={`text-[14.5px] leading-[1.4] tracking-[-.015em] ${
                        tier.highlight ? "text-[#45424c]" : "text-[#c2bfcb]"
                      }`}
                    >
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={`mt-7 rounded-full px-6 py-3 text-center text-[15px] font-bold tracking-[-.02em] no-underline transition-[background-color,transform] duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                    tier.highlight
                      ? "bg-[#121116] text-[#f5f4f7] hover:bg-[#29262e]"
                      : "bg-[#f5f4f7] text-[#121116] hover:bg-[#dedde2]"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-sm text-[#83808c]">
          Prices shown are current list pricing, subject to change. No card required to start. The
          included-volume figures above are the plan you&apos;re sized for, not a hard cutoff — we&apos;ll
          reach out before anything is throttled, never a surprise bill.
        </p>
      </div>
    </section>
  );
}
