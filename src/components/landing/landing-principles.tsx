const PRINCIPLES = [
  {
    kicker: "Signal",
    t: "Reads more than a segment",
    d: "Source, campaign, device, return status and an inferred intent — recomputed on every visit, not assigned once and forgotten.",
  },
  {
    kicker: "Boundary",
    t: "Touches less than you'd expect",
    d: "Every element carries a boundary: free, restricted, or never-touch. Pricing, legal and brand identity stay frozen by default.",
  },
  {
    kicker: "Proof",
    t: "Proves the lift, or reverts",
    d: "Every variant runs against a true holdout. What doesn't win rolls back on its own — no one has to notice and step in.",
  },
];

export function LandingPrinciples() {
  return (
    <section className="px-6 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px] border-t border-[#2a2830] pt-16">
        <h2 className="m-0 max-w-[640px] text-[clamp(30px,3.6vw,48px)] leading-[1.05] font-bold tracking-[-.05em] text-balance">
          Sees more. <span className="text-[#6b6875]">Touches less. Proves it.</span>
        </h2>
        <p className="mt-4 max-w-[560px] text-[16.5px] leading-[1.5] tracking-[-.02em] text-[#a5a2ae] text-pretty">
          The engine only earns the right to keep changing your page by staying inside these three
          lines.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.t}>
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.08em] text-[oklch(0.72_0.15_150)] uppercase">
                <span className="h-[7px] w-[7px] rounded-full bg-[oklch(0.72_0.15_150)]" />
                {p.kicker}
              </div>
              <div className="mt-3 text-[22px] leading-[1.15] font-bold tracking-[-.03em] text-[#f5f4f7]">
                {p.t}
              </div>
              <div className="mt-2.5 text-[15px] leading-[1.5] tracking-[-.015em] text-[#a5a2ae] text-pretty">
                {p.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
