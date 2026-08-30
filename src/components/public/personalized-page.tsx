"use client";

import { useEffect, useRef, useState } from "react";
import { resolve } from "@dynamify/personalization-sdk";
import { buildVisitorContext, getOrCreateVisitorId } from "@/lib/tracking/visitorContext";
import { sendEvent } from "@/lib/tracking/beacon";
import { ComponentBlock } from "@/components/public/component-block";
import type { PageDefinition, ResolvedPage, VisitorContext } from "@dynamify/personalization-sdk";
import type { ComponentType } from "@/lib/pages/componentFields";

function defaultResolved(definition: PageDefinition): ResolvedPage {
  return {
    id: definition.id,
    components: [...definition.components]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ id: c.id, type: c.type, order: c.order, content: c.defaultContent })),
  };
}

function findTrackTarget(
  el: Element | null,
): { type: string; componentId: string; variantId?: string } | null {
  const trackEl = el?.closest<HTMLElement>("[data-track]");
  if (!trackEl) return null;
  const componentEl = trackEl.closest<HTMLElement>("[data-component-id]");
  const componentId = componentEl?.dataset.componentId;
  if (!componentId) return null;
  return { type: trackEl.dataset.track!, componentId, variantId: componentEl?.dataset.variantId };
}

async function getCampaignVariant(campaignId: string, visitorId: string): Promise<"DEFAULT" | "VARIANT"> {
  try {
    const res = await fetch("/api/campaign-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, visitorId }),
    });
    if (!res.ok) return "VARIANT"; // fail open to normal personalization, never break the page
    const data = await res.json();
    return data.variant === "DEFAULT" ? "DEFAULT" : "VARIANT";
  } catch {
    return "VARIANT";
  }
}

// D1/D2: the server already rendered the default (this initial state), so
// the page is complete and correct with JS disabled or before this effect
// runs. Once it runs, resolve() — the exact same pure function tested in
// tests/unit/personalization — swaps in whatever matches this visitor,
// unless an active campaign (Phase 4) assigned this visitor to the
// "default" arm, in which case personalization is deliberately withheld so
// the two arms are actually comparable.
export function PersonalizedPage({
  definition,
  geo,
  campaignId,
}: {
  definition: PageDefinition;
  geo?: VisitorContext["geo"];
  campaignId?: string;
}) {
  const [resolved, setResolved] = useState<ResolvedPage>(() => defaultResolved(definition));
  const formStartFired = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { visitorId } = getOrCreateVisitorId();

      const campaignArm = campaignId ? await getCampaignVariant(campaignId, visitorId) : null;
      if (cancelled) return;

      // Deliberate: VisitorContext (UTM, referrer, device, the visitor
      // cookie) only exists in the browser, so the swap genuinely cannot
      // happen during render or on the server — this is the D1/D2 client
      // resolver itself, not a data-fetch-on-mount that should be derived
      // differently.
      const next =
        campaignArm === "DEFAULT" ? defaultResolved(definition) : resolve(buildVisitorContext(geo), definition);
      setResolved(next);

      sendEvent({ visitorId, pageId: definition.id, type: "PAGE_VIEW", campaignId });
      if (campaignArm !== "DEFAULT") {
        for (const component of next.components) {
          if (component.matchedVariantId) {
            sendEvent({
              visitorId,
              pageId: definition.id,
              type: "PERSONALIZATION_IMPRESSION",
              componentId: component.id,
              componentVariantId: component.matchedVariantId,
              campaignId,
            });
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClick(event: React.MouseEvent<HTMLElement>) {
    const target = findTrackTarget(event.target as Element);
    if (!target || (target.type !== "cta_click" && target.type !== "form_submit")) return;
    const { visitorId } = getOrCreateVisitorId();
    sendEvent({
      visitorId,
      pageId: definition.id,
      type: target.type === "cta_click" ? "CTA_CLICK" : "FORM_SUBMIT",
      componentId: target.componentId,
      componentVariantId: target.variantId,
      campaignId,
    });
  }

  function handleFocus(event: React.FocusEvent<HTMLElement>) {
    const target = findTrackTarget(event.target as Element);
    if (!target || target.type !== "form_start") return;
    if (formStartFired.current.has(target.componentId)) return;
    formStartFired.current.add(target.componentId);
    const { visitorId } = getOrCreateVisitorId();
    sendEvent({
      visitorId,
      pageId: definition.id,
      type: "FORM_START",
      componentId: target.componentId,
      campaignId,
    });
  }

  return (
    <main onClickCapture={handleClick} onFocusCapture={handleFocus}>
      {resolved.components.map((component) => (
        <ComponentBlock
          key={component.id}
          componentId={component.id}
          variantId={component.matchedVariantId}
          type={component.type as ComponentType}
          content={component.content}
        />
      ))}
    </main>
  );
}
