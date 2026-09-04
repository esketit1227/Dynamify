export function LandingCta() {
  return (
    <section id="cta" className="px-6 pb-20 md:pb-[130px] text-center">
      <div className="mx-auto max-w-[820px]">
        <h2 className="m-0 text-[clamp(40px,6vw,86px)] leading-[.95] font-bold tracking-[-.055em] text-balance">
          Same site. <span className="text-[#6b6875]">Better fit.</span>
        </h2>
        <p className="mx-auto mt-7 max-w-[520px] text-lg leading-[1.45] tracking-[-.02em] text-[#a5a2ae]">
          Start with one page and see what changes. Most teams are live before the day is out.
        </p>
        <div className="mt-9 flex justify-center gap-3">
          <a
            href="#top"
            className="rounded-full bg-[#f5f4f7] px-8 py-[18px] text-base font-bold tracking-[-.02em] text-[#121116] no-underline transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-[#dedde2] active:scale-[0.97]"
          >
            Get started
          </a>
          <a
            href="#top"
            className="rounded-full bg-[#29262e] px-8 py-[18px] text-base font-bold tracking-[-.02em] text-[#f5f4f7] no-underline transition-[background-color,transform] duration-200 hover:scale-[1.03] hover:bg-[#34313b] active:scale-[0.97]"
          >
            Book an intro
          </a>
        </div>
      </div>
    </section>
  );
}
