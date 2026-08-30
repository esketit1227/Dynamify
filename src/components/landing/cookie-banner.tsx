"use client";

import { useState } from "react";

export function CookieBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="fixed bottom-[22px] left-[22px] z-[80] flex max-w-[380px] items-center gap-[18px] rounded-2xl bg-[#fdfdfe] py-[18px] pr-[18px] pl-[22px] shadow-[0_1px_2px_rgba(17,16,20,.06),0_24px_48px_-24px_rgba(17,16,20,.35)]">
      <span className="text-sm leading-[1.4] tracking-[-.02em] text-[#56545e]">
        We use context signals to personalize content. Nothing creepy, nothing sold.
      </span>
      <button
        onClick={() => setOpen(false)}
        className="cursor-pointer rounded-[10px] bg-[#edecf1] px-4 py-2.5 text-[13.5px] font-bold whitespace-nowrap text-[#111014]"
      >
        Okay
      </button>
    </div>
  );
}
