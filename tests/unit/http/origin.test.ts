import { describe, it, expect } from "vitest";
import { originFromHeaders } from "@/lib/http/origin";

function headersFrom(values: Record<string, string>) {
  const map = new Map(Object.entries(values));
  return { get: (name: string) => map.get(name) ?? null };
}

describe("originFromHeaders", () => {
  it("uses https when x-forwarded-proto is set", () => {
    const origin = originFromHeaders(headersFrom({ host: "app.dynamify.com", "x-forwarded-proto": "https" }));
    expect(origin).toBe("https://app.dynamify.com");
  });

  it("defaults to http for a localhost host with no forwarded-proto header", () => {
    const origin = originFromHeaders(headersFrom({ host: "localhost:3000" }));
    expect(origin).toBe("http://localhost:3000");
  });

  it("defaults to https for a non-localhost host with no forwarded-proto header", () => {
    const origin = originFromHeaders(headersFrom({ host: "app.dynamify.com" }));
    expect(origin).toBe("https://app.dynamify.com");
  });

  it("falls back to localhost:3000 when no host header is present at all", () => {
    const origin = originFromHeaders(headersFrom({}));
    expect(origin).toBe("http://localhost:3000");
  });
});
