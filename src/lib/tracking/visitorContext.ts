"use client";

import type { VisitorContext } from "@dynamify/personalization-sdk";

const VISITOR_COOKIE = "dynamify_visitor";
const SESSION_COUNT_KEY = "dynamify_session_count";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  // First-party, functional-only, no PII — see docs/decisions.md D4.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

// Returns the visitor id and whether this is a returning visitor (the
// cookie already existed before this call). Simplification, flagged: session
// count increments on every page load rather than tracking real session
// boundaries — good enough to demonstrate the loop, not a real session model.
export function getOrCreateVisitorId(): { visitorId: string; returning: boolean } {
  const existing = readCookie(VISITOR_COOKIE);
  if (existing) return { visitorId: existing, returning: true };

  const id = crypto.randomUUID();
  writeCookie(VISITOR_COOKIE, id);
  return { visitorId: id, returning: false };
}

function incrementSessionCount(): number {
  try {
    const raw = window.localStorage.getItem(SESSION_COUNT_KEY);
    const next = (raw ? parseInt(raw, 10) : 0) + 1;
    window.localStorage.setItem(SESSION_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1; // localStorage unavailable (private mode, etc.) — degrade, don't throw
  }
}

function detectDevice(): VisitorContext["device"] {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

// Builds VisitorContext entirely from data already available in the
// browser — no network call on the critical path (D3). `geo` is passed in
// because it can only be read from edge headers server-side.
export function buildVisitorContext(geo?: VisitorContext["geo"]): VisitorContext {
  const { returning } = getOrCreateVisitorId();
  const sessionCount = incrementSessionCount();
  const params = new URLSearchParams(window.location.search);

  return {
    geo,
    device: detectDevice(),
    referrer: document.referrer || undefined,
    utm: {
      source: params.get("utm_source") ?? undefined,
      medium: params.get("utm_medium") ?? undefined,
      campaign: params.get("utm_campaign") ?? undefined,
      term: params.get("utm_term") ?? undefined,
      content: params.get("utm_content") ?? undefined,
    },
    returning,
    sessionCount,
  };
}
