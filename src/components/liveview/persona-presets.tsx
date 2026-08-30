"use client";

import { motion } from "framer-motion";
import type { VisitorContext } from "@dynamify/personalization-sdk";

export type PersonaPreset = {
  id: string;
  label: string;
  description: string;
  context: VisitorContext;
};

// Real signals this app actually computes, not placeholder personas —
// each of these resolves against real rule types a merchant can build
// (device, UTM/referrer, returning, and the behavioral stage/intentScore
// from src/lib/visitors/inferProfile.ts). The first-touch demo experience
// is a fast, confident click, not a 15-field form filled out live in
// front of a prospect — VisitorProfileForm is still there, just demoted
// to "Customize further" for the edge cases that need it.
export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "first-time",
    label: "First-time visitor",
    description: "No history, no context — the unpersonalized default.",
    context: {},
  },
  {
    id: "returning",
    label: "Returning visitor",
    description: "Been to the site before.",
    context: { returning: true },
  },
  {
    id: "mobile-ad",
    label: "Mobile, from a Google ad",
    description: "Tapped a paid search ad on their phone.",
    context: { device: "mobile", referrer: "https://www.google.com/", utm: { source: "google", medium: "cpc" } },
  },
  {
    id: "warming-up",
    label: "Warming up",
    description: "A tracked visitor who's looked around but hasn't committed.",
    context: { attributes: { stage: "consideration", intentScore: 0.5 } },
  },
  {
    id: "ready-to-buy",
    label: "Ready to buy",
    description: "Multiple visits, real engagement — the strongest intent signal this app computes.",
    context: { attributes: { stage: "evaluation", intentScore: 0.85 } },
  },
  {
    id: "enterprise",
    label: "Enterprise, company identified",
    description: "IP-identified as a company (real firmographic enrichment).",
    context: { attributes: { company: "Acme Corp" } },
  },
];

export function PersonaPresets({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (preset: PersonaPreset) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {PERSONA_PRESETS.map((preset) => {
        const active = selectedId === preset.id;
        return (
          <motion.button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            whileTap={{ scale: 0.97 }}
            aria-pressed={active}
            className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-foreground hover:border-foreground/40"
            }`}
          >
            <p className="text-sm font-medium">{preset.label}</p>
            <p className={`mt-0.5 text-xs ${active ? "text-background/70" : "text-muted"}`}>{preset.description}</p>
          </motion.button>
        );
      })}
    </div>
  );
}
