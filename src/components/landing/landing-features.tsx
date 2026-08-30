const FEATURES = [
  { i: "▣", t: "Boundaries", d: "Mark elements as free, restricted or never-touch. Pricing and legal stay frozen by default." },
  { i: "○", t: "Brand voice profile", d: "Learned from your own site: tone, vocabulary, sentence length, formality." },
  { i: "△", t: "Brand safety", d: "No invented customers, stats, testimonials or claims. Missing facts fall back to your original copy." },
  { i: "◎", t: "Full attribution", d: "See what changed, why, who saw it and which signal triggered it." },
  { i: "□", t: "Version history", d: "Every variant is reversible. Restore the original instantly." },
  { i: "◇", t: "Recommendations", d: "Dynamify proposes the opportunity; you approve, edit or ignore." },
];

export function LandingFeatures() {
  return (
    <section className="px-6 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="m-0 max-w-[560px] text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em] text-balance">
            Control the AI, <span className="text-[#9d9ba4]">not the other way round.</span>
          </h2>
          <p className="m-0 max-w-[360px] text-[16.5px] leading-[1.5] tracking-[-.02em] text-[#7c7a85] text-pretty">
            Every change is visible, attributable and reversible. Nothing ships that you haven&apos;t
            allowed.
          </p>
        </div>
        <div className="mt-11 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.t}
              className="flex min-h-[230px] flex-col rounded-[20px] bg-[#fdfdfe] p-[30px] shadow-[0_1px_2px_rgba(17,16,20,.05)]"
            >
              <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#edecf1] text-xs text-[#56545e]">
                {f.i}
              </div>
              <div className="mt-[22px] text-xl leading-[1.1] font-bold tracking-[-.038em]">{f.t}</div>
              <div className="mt-3 text-[15px] leading-[1.48] tracking-[-.018em] text-[#7c7a85] text-pretty">{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
