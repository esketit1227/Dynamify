"use client";

import { useState } from "react";
import Image from "next/image";

type Panel = {
  title: string;
  meta: string;
  kicker: string;
  headline: string;
  body: string;
  cta: string;
  img: string;
};

const TABS = ["Personalization", "Visitor signals", "Impact"];

const PANELS: Panel[] = [
  {
    title: "Studio",
    meta: "hero · variant 3 of 3",
    kicker: "Personalized for creative agencies",
    headline: "Project management built for creative teams and client work.",
    body: "Generated from your own site copy, then checked against your brand profile for tone, length and factual claims.",
    cta: "See how agencies use it",
    img: "agency workflow image",
  },
  {
    title: "Signals",
    meta: "last 24h · 12.4k visits",
    kicker: "Visitor context",
    headline: "LinkedIn · Creative Agencies campaign · returning · desktop.",
    body: "Source, campaign, region, device and behavior combine into an intent read — no rigid if/else rules to maintain.",
    cta: "Inspect signal set",
    img: "signal map placeholder",
  },
  {
    title: "Impact",
    meta: "A/B · 30 days",
    kicker: "Generic vs. personalized",
    headline: "6.7% conversion against a 3.8% generic baseline.",
    body: "Every variant is measured against the original. Losing variants roll back on their own.",
    cta: "Open full report",
    img: "conversion chart placeholder",
  },
];

const AUDIENCE_ROWS = [
  { pct: "38%", name: "LinkedIn B2B", src: "utm" },
  { pct: "24%", name: "Creative agencies", src: "search" },
  { pct: "19%", name: "Returning customers", src: "crm" },
  { pct: "11%", name: "Enterprise IT", src: "campaign" },
];

const CHANGE_ROWS = [
  { element: "hero / headline", from: "Project management for modern teams.", to: "Built for creative teams and client work." },
  { element: "hero / cta", from: "Get started", to: "See how agencies use it" },
  { element: "hero / image", from: "generic-product.jpg", to: "agency-workflow.jpg" },
];

const stripedPattern = {
  backgroundImage: "repeating-linear-gradient(135deg, #e7e6ec 0 9px, #f4f3f7 9px 18px)",
};

export function LandingHero() {
  const [tab, setTab] = useState(0);
  const panel = PANELS[tab];

  return (
    <section
      id="top"
      className="relative flex flex-col items-center px-6 pt-24 md:pt-[170px] text-center"
    >
      <div
        className="pointer-events-none absolute top-[430px] left-1/2 z-0 h-[700px] w-[min(1560px,112vw)] -translate-x-1/2 overflow-hidden select-none"
      >
        <Image
          src="/landing/hero-branch.png"
          alt=""
          fill
          className="object-cover opacity-[.88] mix-blend-multiply"
          style={{
            WebkitMaskImage: "radial-gradient(120% 100% at 50% 55%, #000 34%, transparent 78%)",
            maskImage: "radial-gradient(120% 100% at 50% 55%, #000 34%, transparent 78%)",
          }}
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, #f0eff3 0%, rgba(240,239,243,.55) 16%, rgba(240,239,243,0) 38%, rgba(240,239,243,.75) 88%, #f0eff3 100%)",
          }}
        />
      </div>

      <div className="relative z-[1] flex items-center gap-[9px] rounded-full bg-[#fdfdfe] py-[7px] pr-[15px] pl-[11px] text-[12.5px] tracking-[-.01em] text-[#56545e] shadow-[0_1px_2px_rgba(17,16,20,.05)]">
        <span className="h-[7px] w-[7px] rounded-full bg-[oklch(0.72_0.15_150)]" />
        A quieter kind of personalization
      </div>

      <h1 className="relative z-[1] mt-[52px] max-w-[1220px] text-[clamp(56px,8.6vw,138px)] leading-[.9] font-bold tracking-[-.055em] text-balance">
        Grows into
        <br />
        <span className="text-[#9d9ba4]">whoever arrives.</span>
      </h1>

      <p className="relative z-[1] mt-11 max-w-[600px] text-[clamp(19px,2vw,25px)] leading-[1.38] tracking-[-.025em] text-[#56545e] text-pretty">
        Your site stays exactly as you built it. What it says just finds its way to the person
        reading.
      </p>

      <div className="relative z-[1] mt-11 flex items-center gap-3">
        <a
          href="#cta"
          className="rounded-full bg-[#111014] px-8 py-[18px] text-base font-bold tracking-[-.02em] text-[#fdfdfe] no-underline transition-colors hover:bg-[#2c2a33]"
        >
          Get started
        </a>
        <a
          href="#demo"
          className="rounded-full bg-[#e3e2e8] px-8 py-[18px] text-base font-bold tracking-[-.02em] text-[#111014] no-underline transition-colors hover:bg-[#dad9e0]"
        >
          See it in motion
        </a>
      </div>

      <div className="relative z-[2] mt-[118px] flex gap-1.5 rounded-full bg-[#e6e5eb] p-[5px]">
        {TABS.map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i)}
            className="cursor-pointer rounded-full px-5 py-2.5 text-sm font-bold tracking-[-.02em]"
            style={{ background: tab === i ? "#fdfdfe" : "transparent", color: tab === i ? "#111014" : "#7c7a85" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-[34px] w-full max-w-[1560px] lg:[perspective:1900px]">
        <div
          className="grid grid-cols-1 items-end gap-[26px] lg:grid-cols-[1fr_1.55fr_1fr] lg:origin-top lg:[transform:rotateX(16deg)_scale(1.02)]"
        >
          {/* Audiences panel */}
          <div
            className="min-h-[420px] rounded-t-2xl bg-[#e9e8ee] p-4"
            style={{ boxShadow: "0 -1px 0 rgba(253,253,254,.9) inset, 0 30px 60px -40px rgba(17,16,20,.5)" }}
          >
            <div className="mb-3 text-[13px] font-extrabold italic tracking-[-.02em]">Audiences</div>
            <div className="mb-3.5 flex rounded-[10px] bg-[#dddce3] p-[3px]">
              <div className="flex-1 rounded-lg bg-[#fdfdfe] py-[7px] text-center text-[12.5px] font-bold italic">
                Detected
              </div>
              <div className="flex-1 py-[7px] text-center text-[12.5px] font-bold text-[#7c7a85] italic">Saved</div>
            </div>
            <div className="grid gap-2.5">
              {AUDIENCE_ROWS.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center gap-2.5 rounded-[10px] bg-[#fdfdfe] px-[13px] py-3"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[#edecf1] text-[10.5px] text-[#56545e]">
                    {row.pct}
                  </span>
                  <span className="flex-1 text-left text-[13px] font-semibold tracking-[-.02em]">{row.name}</span>
                  <span className="text-[10.5px] text-[#9d9ba4]">{row.src}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center dynamic panel */}
          <div
            className="min-h-[520px] rounded-t-[18px] bg-[#ececf1] p-[18px] text-left"
            style={{ boxShadow: "0 40px 80px -50px rgba(17,16,20,.55)" }}
          >
            <div className="mb-3.5 flex items-baseline gap-2.5">
              <div className="text-sm font-extrabold tracking-[-.03em]">{panel.title}</div>
              <div className="text-[11px] text-[#7c7a85]">{panel.meta}</div>
            </div>
            <div className="rounded-[14px] bg-[#fdfdfe] px-[26px] pt-[26px] shadow-[0_1px_2px_rgba(17,16,20,.05)]">
              <div className="text-[11px] font-bold tracking-[-.01em] text-[#9d9ba4]">{panel.kicker}</div>
              <div className="mt-3 text-[clamp(22px,2.6vw,34px)] leading-[1.1] font-bold tracking-[-.04em] text-pretty">
                {panel.headline}
              </div>
              <div className="mt-3.5 max-w-[480px] text-[15px] leading-[1.45] tracking-[-.02em] text-[#7c7a85]">
                {panel.body}
              </div>
              <div className="mt-5 flex gap-2">
                <span className="rounded-full bg-[#111014] px-[18px] py-[11px] text-[13px] font-bold text-[#fdfdfe]">
                  {panel.cta}
                </span>
                <span className="rounded-full bg-[#edecf1] px-[18px] py-[11px] text-[13px] font-bold text-[#56545e]">
                  Preview original
                </span>
              </div>
              <div
                className="mt-[22px] flex h-[190px] items-start justify-center rounded-t-xl pt-[26px]"
                style={stripedPattern}
              >
                <span className="rounded-md bg-[#fdfdfe] px-2.5 py-[5px] text-[11px] text-[#7c7a85]">{panel.img}</span>
              </div>
            </div>
          </div>

          {/* Live changes panel */}
          <div
            className="min-h-[400px] rounded-t-2xl bg-[#e9e8ee] p-4"
            style={{ boxShadow: "0 30px 60px -40px rgba(17,16,20,.5)" }}
          >
            <div className="mb-3 text-[13px] font-extrabold italic tracking-[-.02em]">Live changes</div>
            <div className="grid gap-2.5">
              {CHANGE_ROWS.map((row) => (
                <div key={row.element} className="rounded-[10px] bg-[#fdfdfe] p-[13px] text-left">
                  <div className="mb-[7px] text-[10.5px] text-[#9d9ba4]">{row.element}</div>
                  <div className="text-[12.5px] tracking-[-.015em] text-[#9d9ba4] line-through">{row.from}</div>
                  <div className="mt-1 text-[13px] font-semibold tracking-[-.02em]">{row.to}</div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-[10px] bg-[#fdfdfe] p-[13px]">
                <span className="text-[12.5px] font-bold">Approve all</span>
                <span className="relative h-5 w-[34px] rounded-full bg-[oklch(0.72_0.15_150)]">
                  <span className="absolute top-[3px] right-[3px] h-3.5 w-3.5 rounded-full bg-[#fdfdfe]" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
