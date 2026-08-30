import Link from "next/link";

const LINK_CLASS = "text-[#111014] no-underline transition-colors hover:text-[#56545e]";

export function LandingNav() {
  return (
    <div className="sticky top-0 z-[60] flex justify-center px-6 pt-[18px]">
      <div className="flex w-full max-w-[1180px] items-center gap-[34px] rounded-[18px] bg-[#fdfdfe] py-3 pr-3 pl-[18px] shadow-[0_1px_2px_rgba(17,16,20,.06),0_12px_32px_-18px_rgba(17,16,20,.28)] sm:pl-[26px]">
        <a href="#top" className={`mr-1.5 text-[17px] font-extrabold tracking-[-.045em] sm:text-[19px] ${LINK_CLASS}`}>
          Dynamify
        </a>
        <div className="hidden items-center gap-7 text-[15.5px] font-semibold tracking-[-.02em] md:flex">
          <a href="#how" className={`flex items-center gap-1.5 ${LINK_CLASS}`}>
            Product
            <span className="block h-[9px] w-[9px] rotate-45 -translate-y-0.5 border-r-[1.6px] border-b-[1.6px] border-[#111014]" />
          </a>
          <a href="#pricing" className={LINK_CLASS}>Pricing</a>
          <a href="#footer" className={LINK_CLASS}>Careers</a>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[14px] font-semibold tracking-[-.02em] sm:gap-[26px] sm:text-[15.5px]">
          <a href="#cta" className={`hidden lg:inline ${LINK_CLASS}`}>Enterprise</a>
          <Link href="/login" className={LINK_CLASS}>Log in</Link>
          <Link
            href="/signup"
            className="rounded-xl bg-[#111014] px-3.5 py-2.5 text-[#fdfdfe] no-underline transition-colors hover:bg-[#2c2a33] sm:px-[22px] sm:py-3"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
