"use client";

export type TrackEventType =
  | "PAGE_VIEW"
  | "PERSONALIZATION_IMPRESSION"
  | "CTA_CLICK"
  | "FORM_START"
  | "FORM_SUBMIT"
  | "CONVERSION";

export function sendEvent(payload: {
  visitorId: string;
  pageId: string;
  type: TrackEventType;
  componentId?: string;
  componentVariantId?: string;
  campaignId?: string;
}) {
  try {
    const body = JSON.stringify(payload);
    // sendBeacon survives page navigation/unload; fetch keepalive is the
    // fallback where it's unavailable. Either way this never blocks
    // rendering and never throws into the caller.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/collect", blob);
    } else {
      fetch("/api/collect", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Tracking must never break the page — swallow and move on.
  }
}
