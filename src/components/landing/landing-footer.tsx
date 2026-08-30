const FOOTER_COLS = [
  { t: "Product", items: ["Personalization", "Signals", "Brand profile", "Analytics"] },
  { t: "Company", items: ["About", "Careers", "Customers", "Blog"] },
  { t: "Resources", items: ["Docs", "Security", "Changelog", "Status"] },
];

export function LandingFooter() {
  return (
    <footer id="footer" className="bg-[#fdfdfe] px-6 pt-[66px] pb-10">
      <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <div className="text-xl font-extrabold tracking-[-.045em]">Dynamify</div>
          <div className="mt-3 max-w-[260px] text-[14.5px] leading-[1.5] tracking-[-.02em] text-[#7c7a85]">
            A layer between your website and the people reading it.
          </div>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.t}>
            <div className="text-[11px] font-bold tracking-[-.01em] text-[#9d9ba4]">{col.t}</div>
            <div className="mt-4 grid gap-2.5">
              {col.items.map((item) => (
                <a
                  key={item}
                  href="#footer"
                  className="text-[14.5px] font-semibold tracking-[-.02em] text-[#56545e] no-underline transition-colors hover:text-[#111014]"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-[1180px] justify-between gap-5 border-t border-[#edecf1] pt-[22px] text-[11px] text-[#9d9ba4]">
        <span>© 2026 Dynamify</span>
        <span>Privacy · Terms · GDPR</span>
      </div>
    </footer>
  );
}
