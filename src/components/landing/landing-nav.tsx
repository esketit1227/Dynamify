"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LINK_CLASS = "link-underline text-[var(--lp-text)] no-underline";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 90);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-[60] flex justify-center px-6 pt-[18px]">
      <div
        className={`flex w-full max-w-[1180px] items-center gap-[34px] rounded-[999px] py-3 pr-3 pl-[18px] transition-[background-color,box-shadow,border-color] duration-300 sm:pl-[26px] ${
          scrolled
            ? "border border-[var(--lp-hairline)] bg-[var(--lp-bg)]/80 shadow-[0_8px_24px_-16px_rgba(20,18,16,.25)] backdrop-blur-[14px]"
            : "border border-transparent bg-transparent"
        }`}
      >
        <a href="#top" className={`mr-1.5 text-[17px] font-semibold tracking-[-.02em] sm:text-[19px] ${LINK_CLASS}`}>
          Dynamify
        </a>
        <div className="hidden items-center gap-7 text-[15.5px] font-medium tracking-[-.01em] md:flex">
          <a href="#how" className={LINK_CLASS}>Product</a>
          <a href="#pricing" className={LINK_CLASS}>Pricing</a>
          <a href="#footer" className={LINK_CLASS}>Careers</a>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[14px] font-medium tracking-[-.01em] sm:gap-[26px] sm:text-[15.5px]">
          <a href="#cta" className={`hidden lg:inline ${LINK_CLASS}`}>Enterprise</a>
          <Link href="/login" className={LINK_CLASS}>Log in</Link>
          <Link
            href="/signup"
            className="pill-invert inline-flex items-center gap-1.5 rounded-[999px] border border-[var(--lp-text)] bg-[var(--lp-text)] px-3.5 py-2.5 text-[var(--lp-bg)] no-underline hover:bg-transparent hover:text-[var(--lp-text)] sm:px-[22px] sm:py-3"
          >
            Sign up <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
