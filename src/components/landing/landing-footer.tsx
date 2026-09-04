import Link from "next/link";

const FOOTER_COLS = [
  { t: "Product", items: ["Personalization", "Signals", "Brand profile", "Analytics"] },
  { t: "Company", items: ["About", "Careers", "Customers", "Blog"] },
  { t: "Resources", items: ["Docs", "Security", "Changelog", "Status"] },
];

export function LandingFooter() {
  return (
    <footer id="footer" className="bg-[#17161b] px-6 pt-[66px] pb-10">
      <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <div className="text-xl font-extrabold tracking-[-.045em] text-[#f5f4f7]">Dynamify</div>
          <div className="mt-3 max-w-[260px] text-[14.5px] leading-[1.5] tracking-[-.02em] text-[#a5a2ae]">
            A layer between your website and the people reading it.
          </div>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.t}>
            <div className="text-[11px] font-bold tracking-[-.01em] text-[#83808c]">{col.t}</div>
            <div className="mt-4 grid gap-2.5">
              {col.items.map((item) => (
                <a
                  key={item}
                  href="#footer"
                  className="text-[14.5px] font-semibold tracking-[-.02em] text-[#c2bfcb] no-underline transition-colors hover:text-[#f5f4f7]"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-[1180px] flex-wrap justify-between gap-x-5 gap-y-2 border-t border-[#2a2830] pt-[22px] text-[11px] text-[#83808c]">
        <span>© 2026 Dynamify</span>
        <span className="flex gap-3">
          <Link href="/privacy" className="text-[#83808c] no-underline transition-colors hover:text-[#f5f4f7]">
            Privacy
          </Link>
          <Link href="/terms" className="text-[#83808c] no-underline transition-colors hover:text-[#f5f4f7]">
            Terms
          </Link>
          <Link
            href="/privacy#gdpr-ccpa-rights"
            className="text-[#83808c] no-underline transition-colors hover:text-[#f5f4f7]"
          >
            GDPR
          </Link>
        </span>
      </div>
    </footer>
  );
}
