const STATS = [
  { v: "+76%", t: "Relative lift", d: "6.7% personalized against 3.8% generic." },
  { v: "63", t: "Editable elements", d: "Found on an average 14-page marketing site." },
  { v: "0", t: "Redesigns", d: "No new pages, URLs or layouts to maintain." },
];

export function LandingImpact() {
  return (
    <section id="impact" className="px-6 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px] rounded-[28px] bg-[#111014] px-6 py-10 text-[#fdfdfe] sm:px-14 sm:py-[66px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="m-0 max-w-[520px] text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em] text-[#fdfdfe] text-balance">
            Personalized vs. generic, measured side by side.
          </h2>
          <div className="text-[11px] font-bold tracking-[-.01em] text-[#8e8c97]">Illustrative pilot data</div>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.t}>
              <div className="text-[clamp(44px,5vw,74px)] leading-[.9] font-bold tracking-[-.055em] text-[#fdfdfe]">
                {s.v}
              </div>
              <div className="mt-4 text-[15.5px] font-semibold tracking-[-.02em] text-[#fdfdfe]">{s.t}</div>
              <div className="mt-1.5 text-sm leading-[1.45] tracking-[-.015em] text-[#8e8c97]">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
