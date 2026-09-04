const STATS = [
  { v: "+76%", t: "Relative lift", d: "6.7% personalized against 3.8% generic." },
  { v: "63", t: "Editable elements", d: "Found on an average 14-page marketing site." },
  { v: "0", t: "Redesigns", d: "No new pages, URLs or layouts to maintain." },
];

export function LandingImpact() {
  return (
    <section id="impact" className="px-6 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px] rounded-[28px] bg-[#f5f4f7] px-6 py-10 text-[#121116] sm:px-14 sm:py-[66px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <div className="max-w-[600px]">
            <div className="text-[11px] font-bold tracking-[-.01em] text-[#6b6975]">
              A page that stops changing is a page that stops learning
            </div>
            <h2 className="mt-3 text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em] text-[#121116] text-balance">
              Personalized vs. generic, measured side by side.
            </h2>
          </div>
          <div className="text-[11px] font-bold tracking-[-.01em] text-[#6b6975]">Illustrative pilot data</div>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.t}>
              <div className="text-[clamp(44px,5vw,74px)] leading-[.9] font-bold tracking-[-.055em] text-[#121116]">
                {s.v}
              </div>
              <div className="mt-4 text-[15.5px] font-semibold tracking-[-.02em] text-[#121116]">{s.t}</div>
              <div className="mt-1.5 text-sm leading-[1.45] tracking-[-.015em] text-[#6b6975]">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
