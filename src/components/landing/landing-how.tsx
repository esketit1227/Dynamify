const STEPS = [
  { n: "01", t: "Connect", d: "Point us at your site." },
  { n: "02", t: "Read", d: "We get a sense of the pages and the voice." },
  { n: "03", t: "Notice", d: "Whatever context a visit happens to carry." },
  { n: "04", t: "Adjust", d: "Wording shifts inside your own components." },
  { n: "05", t: "Learn", d: "Held against the original, and quietly improved." },
];

export function LandingHow() {
  return (
    <section id="how" className="px-6 pt-5 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px]">
        <h2 className="m-0 text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em]">
          How it tends <span className="text-[#9d9ba4]">to go.</span>
        </h2>
        <div className="mt-11 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="flex min-h-[210px] flex-col gap-3 rounded-[18px] bg-[#fdfdfe] px-5 pt-6 pb-[26px] shadow-[0_1px_2px_rgba(17,16,20,.05)]"
            >
              <div className="text-xs text-[#9d9ba4]">{s.n}</div>
              <div className="text-[19px] leading-[1.1] font-bold tracking-[-.035em]">{s.t}</div>
              <div className="text-sm leading-[1.45] tracking-[-.015em] text-[#7c7a85] text-pretty">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
