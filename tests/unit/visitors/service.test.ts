import { describe, it, expect } from "vitest";
import { isNewSessionBoundary, geoFromHeaders, SESSION_GAP_MINUTES } from "@/lib/visitors/service";

describe("isNewSessionBoundary", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("is not a new session just under the gap", () => {
    const lastEventAt = new Date(now.getTime() - (SESSION_GAP_MINUTES - 1) * 60 * 1000);
    expect(isNewSessionBoundary(lastEventAt, now)).toBe(false);
  });

  it("is a new session just over the gap", () => {
    const lastEventAt = new Date(now.getTime() - (SESSION_GAP_MINUTES + 1) * 60 * 1000);
    expect(isNewSessionBoundary(lastEventAt, now)).toBe(true);
  });

  it("is not a new session for a lastEventAt in the same instant", () => {
    expect(isNewSessionBoundary(now, now)).toBe(false);
  });
});

describe("geoFromHeaders", () => {
  function headers(map: Record<string, string>) {
    return { get: (name: string) => map[name] ?? null };
  }

  it("reads Vercel's edge geo headers when present", () => {
    const geo = geoFromHeaders(headers({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA" }));
    expect(geo).toEqual({ country: "US", region: "CA" });
  });

  it("falls back to Cloudflare's country header when Vercel's is absent", () => {
    const geo = geoFromHeaders(headers({ "cf-ipcountry": "DE" }));
    expect(geo.country).toBe("DE");
  });

  it("returns an empty object when no edge geo header is present (e.g. local dev)", () => {
    const geo = geoFromHeaders(headers({}));
    expect(geo).toEqual({ country: undefined, region: undefined });
  });
});
