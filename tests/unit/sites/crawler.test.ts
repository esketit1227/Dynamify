import { describe, it, expect } from "vitest";
import { normalizeUrl } from "@/lib/sites/crawler";

describe("normalizeUrl", () => {
  it("treats the bare root and its trailing-slash form as the same page", () => {
    expect(normalizeUrl("https://example.com")).toBe(normalizeUrl("https://example.com/"));
  });

  it("treats a deeper path with and without a trailing slash as the same page", () => {
    expect(normalizeUrl("https://example.com/pricing")).toBe(
      normalizeUrl("https://example.com/pricing/"),
    );
  });

  it("strips the hash", () => {
    expect(normalizeUrl("https://example.com/pricing#faq")).toBe(
      normalizeUrl("https://example.com/pricing"),
    );
  });

  it("keeps distinct paths distinct", () => {
    expect(normalizeUrl("https://example.com/pricing")).not.toBe(
      normalizeUrl("https://example.com/about"),
    );
  });

  it("preserves query strings as meaningfully distinct", () => {
    expect(normalizeUrl("https://example.com/blog?page=2")).not.toBe(
      normalizeUrl("https://example.com/blog"),
    );
  });
});
