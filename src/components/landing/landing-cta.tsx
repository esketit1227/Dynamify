export function LandingCta() {
  return (
    <section id="cta" className="px-6 pb-20 md:pb-[130px] text-center">
      <div className="mx-auto max-w-[820px]">
        <h2 className="m-0 text-[clamp(40px,6vw,86px)] leading-[.95] font-bold tracking-[-.055em] text-balance">
          Same site. <span className="text-[#9d9ba4]">Better fit.</span>
        </h2>
        <p className="mx-auto mt-7 max-w-[520px] text-lg leading-[1.45] tracking-[-.02em] text-[#7c7a85]">
          Start with one page and see what changes. Most teams are live before the day is out.
        </p>
        <div className="mt-9 flex justify-center gap-3">
          <a
            href="#top"
            className="rounded-full bg-[#111014] px-8 py-[18px] text-base font-bold tracking-[-.02em] text-[#fdfdfe] no-underline transition-colors hover:bg-[#2c2a33]"
          >
            Get started
          </a>
          <a
            href="#top"
            className="rounded-full bg-[#e3e2e8] px-8 py-[18px] text-base font-bold tracking-[-.02em] text-[#111014] no-underline transition-colors hover:bg-[#dad9e0]"
          >
            Book an intro
          </a>
        </div>
      </div>
    </section>
  );
}
