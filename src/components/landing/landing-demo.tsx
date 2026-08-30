"use client";

import { useState } from "react";

type Audience = {
  label: string;
  headline: string;
  sub: string;
  cta: string;
  img: string;
  rows: [string, string][];
};

const AUDIENCES: Audience[] = [
  {
    label: "Startup founder",
    headline: "Move your startup from idea to execution faster.",
    sub: "Ship the roadmap without hiring a program manager first.",
    cta: "Start free trial",
    img: "small-team product shot",
    rows: [
      ["Signal", 'Google search · "project tool for small teams"'],
      ["Inferred intent", "Speed, low setup cost"],
      ["Original copy", "The smarter way to manage your projects."],
    ],
  },
  {
    label: "Enterprise buyer",
    headline: "A smarter way to manage projects across your organization.",
    sub: "SSO, audit trails and rollout support for thousands of seats.",
    cta: "Talk to sales",
    img: "enterprise dashboard image",
    rows: [
      ["Signal", "LinkedIn campaign · Enterprise IT"],
      ["Inferred intent", "Governance, scale, procurement"],
      ["Original copy", "The smarter way to manage your projects."],
    ],
  },
  {
    label: "Creative agency",
    headline: "Keep every client project organized from brief to delivery.",
    sub: "Retainers, approvals and deliverables in one shared view.",
    cta: "See how agencies use it",
    img: "studio / client work image",
    rows: [
      ["Signal", 'Campaign "Creative Agencies"'],
      ["Inferred intent", "Client + project workflow"],
      ["Original copy", "The smarter way to manage your projects."],
    ],
  },
  {
    label: "Returning customer",
    headline: "Welcome back. Your workspace is where you left it.",
    sub: "Three projects moved since your last visit.",
    cta: "Go to your dashboard",
    img: "in-product screenshot",
    rows: [
      ["Signal", "Known customer · CRM match"],
      ["Inferred intent", "Re-entry, not acquisition"],
      ["Original copy", "The smarter way to manage your projects."],
    ],
  },
];

const LOCKED = ["Logo", "Brand colors", "Typography", "Layout", "Pricing", "Legal text", "Navigation"];

const stripedPattern = {
  backgroundImage: "repeating-linear-gradient(135deg, #e7e6ec 0 9px, #f4f3f7 9px 18px)",
};

export function LandingDemo() {
  const [aud, setAud] = useState(0);
  const a = AUDIENCES[aud];

  return (
    <section id="demo" className="px-6 py-20 md:py-[130px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <div>
            <div className="text-[11.5px] font-bold tracking-[-.01em] text-[#9d9ba4]">A look</div>
            <h2 className="mt-4 max-w-[640px] text-[clamp(38px,5vw,68px)] leading-[.98] font-bold tracking-[-.05em] text-balance">
              One page.
              <br />
              <span className="text-[#9d9ba4]">Many readings.</span>
            </h2>
          </div>
          <p className="m-0 max-w-[380px] text-[17px] leading-[1.5] tracking-[-.02em] text-[#7c7a85] text-pretty">
            Move between audiences and watch a familiar page settle into a different tone. Nothing
            about the design shifts.
          </p>
        </div>

        <div className="mt-11 flex flex-wrap gap-2">
          {AUDIENCES.map((audience, i) => (
            <button
              key={audience.label}
              onClick={() => setAud(i)}
              className="cursor-pointer rounded-full px-[22px] py-3 text-[14.5px] font-bold tracking-[-.02em]"
              style={{ background: aud === i ? "#111014" : "#e3e2e8", color: aud === i ? "#fdfdfe" : "#56545e" }}
            >
              {audience.label}
            </button>
          ))}
        </div>

        <div className="mt-[22px] grid grid-cols-1 items-stretch gap-[22px] lg:grid-cols-[1.45fr_1fr]">
          <div className="rounded-[22px] bg-[#fdfdfe] shadow-[0_1px_2px_rgba(17,16,20,.05),0_40px_80px_-60px_rgba(17,16,20,.5)]">
            <div className="flex items-center gap-2 border-b border-[#edecf1] px-[18px] py-3.5">
              <span className="h-[9px] w-[9px] rounded-full bg-[#e0dfe6]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[#e0dfe6]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[#e0dfe6]" />
              <span className="ml-3 text-[11px] text-[#9d9ba4]">acme.com</span>
            </div>
            <div className="flex items-center justify-between border-b border-[#f4f3f7] px-[26px] pt-5 pb-3">
              <span className="text-[15px] font-extrabold tracking-[-.04em]">Acme</span>
              <span className="flex gap-[18px] text-[12.5px] font-semibold text-[#9d9ba4]">Product Pricing Docs</span>
            </div>
            <div className="px-[46px] pt-[58px] pb-[52px] text-center">
              <div className="text-[clamp(28px,3.4vw,44px)] leading-[1.03] font-bold tracking-[-.045em] text-balance">
                {a.headline}
              </div>
              <div className="mx-auto mt-5 max-w-[420px] text-[16.5px] leading-[1.45] tracking-[-.02em] text-[#7c7a85] text-pretty">
                {a.sub}
              </div>
              <div className="mt-7 inline-flex rounded-full bg-[#111014] px-[26px] py-[15px] text-[14.5px] font-bold tracking-[-.02em] text-[#fdfdfe]">
                {a.cta}
              </div>
              <div className="mt-10 flex h-[210px] items-center justify-center rounded-[14px]" style={stripedPattern}>
                <span className="rounded-md bg-[#fdfdfe] px-[11px] py-1.5 text-[11px] text-[#7c7a85]">{a.img}</span>
              </div>
            </div>
          </div>

          <div className="grid content-start gap-[22px]">
            <div className="rounded-[22px] bg-[#111014] p-[26px] text-[#fdfdfe]">
              <div className="text-[11px] font-bold tracking-[-.01em] text-[#8e8c97]">Why this changed</div>
              <div className="mt-5 grid gap-4">
                {a.rows.map(([k, v]) => (
                  <div key={k}>
                    <div className="mb-[5px] text-[11.5px] text-[#8e8c97]">{k}</div>
                    <div className="text-[15px] leading-[1.35] font-semibold tracking-[-.02em] text-[#fdfdfe]">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-[26px] flex gap-2">
                <span className="rounded-full bg-[#fdfdfe] px-[18px] py-2.5 text-[13px] font-bold text-[#111014]">
                  Approve
                </span>
                <span className="rounded-full bg-[#2c2a33] px-[18px] py-2.5 text-[13px] font-bold text-[#d8d7de]">
                  Edit
                </span>
                <span className="rounded-full bg-[#2c2a33] px-[18px] py-2.5 text-[13px] font-bold text-[#d8d7de]">
                  Disable
                </span>
              </div>
            </div>
            <div className="rounded-[22px] bg-[#fdfdfe] p-[26px] shadow-[0_1px_2px_rgba(17,16,20,.05)]">
              <div className="text-[11px] font-bold tracking-[-.01em] text-[#9d9ba4]">Never touched</div>
              <div className="mt-4 flex flex-wrap gap-[7px]">
                {LOCKED.map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-[#f2f1f5] px-[13px] py-2 text-[12.5px] font-semibold tracking-[-.015em] text-[#56545e]"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
