"use client";

import { useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { ResolvedPage } from "@dynamify/personalization-sdk";

// The signature moment (docs/roadmap.md's Live View redesign note): when
// the persona changes, each personalized element lifts away and the new
// value settles into place, confirmed with a brief green pulse — reusing
// "green = this was personalized" (--status-positive), the same meaning
// this color already carries across Analytics/Visitors/Sites, not a new
// signal invented for this one page. Staggered per changed element so
// persona -> change reads as cause -> effect, not a jump cut.
const STAGGER_STEP = 0.09;
const PERSONALIZED_GLOW = "rgba(31, 157, 85, 0.22)";
const PERSONALIZED_GLOW_END = "rgba(31, 157, 85, 0)";

// Sections that don't read as content in a hero-style preview — still
// real data (shown in the "what changed" list), just not rendered here.
const SKIPPED_TYPES = new Set(["CTA_HREF", "NAV_LABEL", "OTHER"]);

function contentText(component: ResolvedPage["components"][number]): string {
  const text = (component.content as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//.test(value) || value.startsWith("/");
}

function AnimatedText({
  value,
  personalized,
  delay,
  reduceMotion,
  as: Tag,
  className,
}: {
  value: string;
  personalized: boolean;
  delay: number;
  reduceMotion: boolean;
  as: "h1" | "h2" | "p" | "span";
  className: string;
}) {
  if (reduceMotion) {
    return <Tag className={className}>{value}</Tag>;
  }

  return (
    <Tag className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: 1,
            y: 0,
            backgroundColor: personalized ? [PERSONALIZED_GLOW, PERSONALIZED_GLOW_END] : PERSONALIZED_GLOW_END,
          }}
          exit={{ opacity: 0, y: -10 }}
          transition={{
            opacity: { duration: 0.28, delay },
            y: { duration: 0.28, delay },
            backgroundColor: { duration: 1.1, delay: delay + 0.15 },
          }}
          className="inline-block rounded-sm"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </Tag>
  );
}

// The primary preview: rendered from our own already-crawled structured
// data (ContentElement + resolved content), not a live re-fetch of the
// external site. This is what makes the demo reliable (no dependency on
// a third party's uptime or X-Frame-Options) and is the only way to get
// the in-place animated transition above at all — you can't smoothly
// animate content inside a sandboxed cross-origin iframe from the parent
// page. See WebsitePreview for the real-site iframe, kept as a secondary,
// optional view.
export function RenderedPreview({
  resolved,
  pageUrl,
  label,
}: {
  resolved: ResolvedPage;
  pageUrl: string;
  label?: string;
}) {
  const reduceMotion = Boolean(useReducedMotion());

  // Only elements that actually changed get a stagger slot — an
  // untouched default element has nothing to announce, so it never
  // steals a beat from the ones that do.
  const delayByComponent = useMemo(() => {
    const map = new Map<string, number>();
    let changedIndex = 0;
    for (const component of resolved.components) {
      if (component.matchedVariantId) {
        map.set(component.id, changedIndex * STAGGER_STEP);
        changedIndex += 1;
      }
    }
    return map;
  }, [resolved]);

  // Computed in one pass up front, not mutated during the render map
  // below — which section eyebrow labels to show (whenever the section
  // changes from the previous rendered component, skipping HERO, which
  // never needs an eyebrow of its own).
  const sectionLabelForComponent = useMemo(() => {
    const map = new Map<string, string>();
    let lastSection: string | undefined;
    for (const component of resolved.components) {
      if (component.section && component.section !== lastSection && component.section !== "HERO") {
        map.set(component.id, component.section);
      }
      if (component.section) lastSection = component.section;
    }
    return map;
  }, [resolved]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {label ? (
        <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted">{label}</div>
      ) : null}
      <div className="flex items-center gap-1.5 border-b border-border bg-background px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-2.5 truncate rounded-md bg-surface px-2.5 py-1 text-xs text-muted">{pageUrl}</span>
      </div>

      <div className="max-h-[560px] overflow-y-auto px-6 py-8 sm:px-10">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          {resolved.components.map((component) => {
            if (SKIPPED_TYPES.has(component.type)) return null;
            const text = contentText(component);
            if (!text) return null;

            const personalized = Boolean(component.matchedVariantId);
            const delay = delayByComponent.get(component.id) ?? 0;

            const sectionName = sectionLabelForComponent.get(component.id);
            const sectionLabel = sectionName ? (
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {sectionName.toLowerCase()}
              </p>
            ) : null;

            if (component.type === "IMAGE" || component.type === "LOGO") {
              if (!looksLikeUrl(text)) return null;
              return (
                <div key={component.id}>
                  {sectionLabel}
                  {/* Arbitrary customer-supplied URL, not a known remote-domain
                      allowlist next/image needs — same posture as
                      element-personalize.tsx's own image preview. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={text} alt="" className="max-h-40 rounded-lg border border-border object-cover" />
                </div>
              );
            }

            if (component.type === "CTA_LABEL") {
              return (
                <div key={component.id}>
                  {sectionLabel}
                  <span className="inline-flex w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
                    <AnimatedText
                      value={text}
                      personalized={personalized}
                      delay={delay}
                      reduceMotion={reduceMotion}
                      as="span"
                      className=""
                    />
                  </span>
                </div>
              );
            }

            const Tag = component.type === "HEADLINE" ? "h1" : component.type === "SUBHEADLINE" ? "h2" : "p";
            const className =
              component.type === "HEADLINE"
                ? "text-3xl font-semibold tracking-tight text-foreground"
                : component.type === "SUBHEADLINE"
                  ? "text-base text-muted"
                  : "text-sm leading-relaxed text-foreground";

            return (
              <div key={component.id}>
                {sectionLabel}
                <AnimatedText
                  value={text}
                  personalized={personalized}
                  delay={delay}
                  reduceMotion={reduceMotion}
                  as={Tag}
                  className={className}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
