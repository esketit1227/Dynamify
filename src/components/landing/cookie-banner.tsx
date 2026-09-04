"use client";

import { useState } from "react";

export function CookieBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="fixed bottom-[22px] left-[22px] z-[80] flex max-w-[380px] items-center gap-[18px] rounded-2xl bg-[#1b1a20] py-[18px] pr-[18px] pl-[22px] ring-1 ring-[#2a2830] shadow-[0_24px_48px_-24px_rgba(0,0,0,.6)]">
      <span className="text-sm leading-[1.4] tracking-[-.02em] text-[#a5a2ae]">
        We use context signals to personalize content. Nothing creepy, nothing sold.
      </span>
      <button
        onClick={() => setOpen(false)}
        className="cursor-pointer rounded-[10px] bg-[#29262e] px-4 py-2.5 text-[13.5px] font-bold whitespace-nowrap text-[#f5f4f7]"
      >
        Okay
      </button>
    </div>
  );
}
