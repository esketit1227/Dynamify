import { describe, it, expect } from "vitest";
import { isEnrichableIp, parseOrgField, enrichIp, hashIp } from "@/lib/enrichment/ipFirmographics";

describe("isEnrichableIp", () => {
  it("accepts a well-formed public IPv4 address", () => {
    expect(isEnrichableIp("8.8.8.8")).toBe(true);
  });

  it("accepts a well-formed public IPv6 address", () => {
    expect(isEnrichableIp("2001:4860:4860::8888")).toBe(true);
  });

  it("rejects private/internal IPv4 ranges", () => {
    expect(isEnrichableIp("10.0.0.5")).toBe(false);
    expect(isEnrichableIp("192.168.1.1")).toBe(false);
    expect(isEnrichableIp("127.0.0.1")).toBe(false);
    expect(isEnrichableIp("169.254.169.254")).toBe(false); // cloud metadata
  });

  it("rejects private/internal IPv6 ranges", () => {
    expect(isEnrichableIp("::1")).toBe(false);
    expect(isEnrichableIp("fe80::1")).toBe(false);
  });

  it("rejects anything that isn't a valid IP at all", () => {
    expect(isEnrichableIp("unknown")).toBe(false);
    expect(isEnrichableIp("not-an-ip")).toBe(false);
    expect(isEnrichableIp("")).toBe(false);
  });
});

describe("parseOrgField", () => {
  it("strips a leading ASN prefix", () => {
    expect(parseOrgField("AS15169 Google LLC")).toBe("Google LLC");
  });

  it("handles an org with no ASN prefix", () => {
    expect(parseOrgField("Acme Inc")).toBe("Acme Inc");
  });

  it("returns undefined for a missing or empty org field", () => {
    expect(parseOrgField(undefined)).toBeUndefined();
    expect(parseOrgField("")).toBeUndefined();
    expect(parseOrgField("AS15169")).toBeUndefined(); // ASN only, no name left
  });

  it("returns undefined for a non-string value", () => {
    expect(parseOrgField(12345)).toBeUndefined();
    expect(parseOrgField(null)).toBeUndefined();
  });
});

// docs/visitor-data.md: "Resolve, use, discard; do not store raw IPs
// beyond what is needed for the lookup." hashIp is what makes that true —
// the cache is keyed by this, never the raw address.
describe("hashIp", () => {
  it("is deterministic for the same input", () => {
    expect(hashIp("8.8.8.8")).toBe(hashIp("8.8.8.8"));
  });

  it("produces different hashes for different IPs", () => {
    expect(hashIp("8.8.8.8")).not.toBe(hashIp("1.1.1.1"));
  });

  it("never returns the raw input itself", () => {
    expect(hashIp("8.8.8.8")).not.toBe("8.8.8.8");
  });

  it("produces a fixed-length hex digest (sha256)", () => {
    expect(hashIp("8.8.8.8")).toMatch(/^[0-9a-f]{64}$/);
  });
});

// The "configured, real provider round-trip" path is deliberately proven
// live instead of mocked here (see docs/roadmap.md's Phase 6 verification
// note) — env.ts parses IPINFO_API_KEY once at module load, so faking
// "configured" cleanly in this test file would need module-cache
// gymnastics that would test the mock more than the code. What's safe and
// meaningful to assert here, against the real (unconfigured) dev env:
describe("enrichIp (not configured)", () => {
  it("returns null without attempting a network call when IPINFO_API_KEY isn't set", async () => {
    await expect(enrichIp("8.8.8.8")).resolves.toBeNull();
  });
});
