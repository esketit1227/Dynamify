import Link from "next/link";

// Real tiers, built around what's actually shipped — no ecommerce/Shopify
// (still just a foundation layer, see docs/ecommerce.md) and no per-seat
// billing (team invites aren't built yet either). Usage-based
// differentiation (sites, tracked page views/mo) rather than one flat
// price for every store size, since the product's own cost to run scales
// with traffic, not just the invoice.
const TIERS = [
  {
    name: "Starter",
    price: "$49",
    tagline: "Validate the idea on one page.",
    cta: "Start free",
    href: "/signup",
    highlight: false,
    features: [
      "1 connected site",
      "Up to 5,000 tracked page views/mo",
      "Unlimited audiences & rules",
      "Live View simulator",
      "Generic vs. personalized analytics",
    ],
  },
  {
    name: "Growth",
    price: "$199",
    tagline: "Most teams start here.",
    cta: "Start free",
    href: "/signup",
    highlight: true,
    features: [
      "Up to 5 connected sites",
      "Up to 50,000 tracked page views/mo",
      "Everything in Starter, plus:",
      "Behavioral targeting (Visitors, intent/stage)",
      "A/B holdout & causal lift measurement",
      "Webhook delivery",
    ],
  },
  {
    name: "Scale",
    price: "Custom",
    tagline: "High-traffic sites, multiple brands.",
    cta: "Talk to us",
    href: "#cta",
    highlight: false,
    features: [
      "Unlimited connected sites",
      "Custom volume",
      "Everything in Growth, plus:",
      "Dedicated support",
      "SSO",
    ],
  },
];

export function LandingPricing() {
  return (
    <section id="pricing" className="px-6 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="m-0 max-w-[560px] text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em] text-balance">
            Simple pricing, <span className="text-[#9d9ba4]">sized to your traffic.</span>
          </h2>
          <p className="m-0 max-w-[360px] text-[16.5px] leading-[1.5] tracking-[-.02em] text-[#7c7a85] text-pretty">
            Every plan gets the full engine — priority/specificity resolution, brand-safety-checked AI
            content, nothing goes live unapproved. Plans differ by volume, not capability tiers hidden
            behind a paywall.
          </p>
        </div>

        <div className="mt-11 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-[20px] p-[30px] shadow-[0_1px_2px_rgba(17,16,20,.05)] ${
                tier.highlight ? "bg-[#111014] text-[#fdfdfe]" : "bg-[#fdfdfe] text-[#111014]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xl font-bold tracking-[-.038em]">{tier.name}</div>
                {tier.highlight ? (
                  <span className="rounded-full bg-[#fdfdfe]/10 px-2.5 py-1 text-[11px] font-bold tracking-[-.01em] text-[#fdfdfe]">
                    Most popular
                  </span>
                ) : null}
              </div>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-[clamp(36px,3.6vw,48px)] leading-none font-bold tracking-[-.05em]">
                  {tier.price}
                </span>
                {tier.price !== "Custom" ? (
                  <span className={`text-sm ${tier.highlight ? "text-[#8e8c97]" : "text-[#7c7a85]"}`}>/mo</span>
                ) : null}
              </div>
              <p className={`mt-2 text-[15px] leading-[1.4] tracking-[-.018em] ${tier.highlight ? "text-[#8e8c97]" : "text-[#7c7a85]"}`}>
                {tier.tagline}
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className={`text-[14.5px] leading-[1.4] tracking-[-.015em] ${
                      tier.highlight ? "text-[#dad9e0]" : "text-[#56545e]"
                    }`}
                  >
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={`mt-7 rounded-full px-6 py-3 text-center text-[15px] font-bold tracking-[-.02em] no-underline transition-colors ${
                  tier.highlight
                    ? "bg-[#fdfdfe] text-[#111014] hover:bg-[#e3e2e8]"
                    : "bg-[#111014] text-[#fdfdfe] hover:bg-[#2c2a33]"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm text-[#7c7a85]">
          Prices shown are current list pricing, subject to change. No card required to start.
        </p>
      </div>
    </section>
  );
}
