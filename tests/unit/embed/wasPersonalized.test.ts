import { describe, it, expect } from "vitest";
import { wasPersonalized } from "@/lib/embed/service";
import type { ResolvedPage } from "@dynamify/personalization-sdk";

function resolvedPage(components: ResolvedPage["components"]): ResolvedPage {
  return { id: "page-1", components };
}

describe("wasPersonalized", () => {
  it("is true at the page level when any component matched a variant", () => {
    const resolved = resolvedPage([
      { id: "a", type: "HEADLINE", order: 0, content: {} },
      { id: "b", type: "CTA_LABEL", order: 1, content: {}, matchedVariantId: "variant-1" },
    ]);
    expect(wasPersonalized(resolved)).toBe(true);
  });

  it("is false at the page level when nothing matched a variant", () => {
    const resolved = resolvedPage([
      { id: "a", type: "HEADLINE", order: 0, content: {} },
      { id: "b", type: "CTA_LABEL", order: 1, content: {} },
    ]);
    expect(wasPersonalized(resolved)).toBe(false);
  });

  it("is false for an empty page", () => {
    expect(wasPersonalized(resolvedPage([]))).toBe(false);
  });

  it("is true at the element level when that specific element matched a variant", () => {
    const resolved = resolvedPage([
      { id: "a", type: "HEADLINE", order: 0, content: {}, matchedVariantId: "variant-1" },
      { id: "b", type: "CTA_LABEL", order: 1, content: {} },
    ]);
    expect(wasPersonalized(resolved, "a")).toBe(true);
  });

  it("is false at the element level when that specific element did not match, even if another element on the page did", () => {
    const resolved = resolvedPage([
      { id: "a", type: "HEADLINE", order: 0, content: {}, matchedVariantId: "variant-1" },
      { id: "b", type: "CTA_LABEL", order: 1, content: {} },
    ]);
    expect(wasPersonalized(resolved, "b")).toBe(false);
  });

  it("is false for an element id that isn't on the page at all", () => {
    const resolved = resolvedPage([{ id: "a", type: "HEADLINE", order: 0, content: {}, matchedVariantId: "variant-1" }]);
    expect(wasPersonalized(resolved, "not-a-real-id")).toBe(false);
  });
});
