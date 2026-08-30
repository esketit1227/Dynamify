import { describe, it, expect } from "vitest";
import { DEFAULT_BOUNDARY_BY_TYPE, effectiveBoundary, boundaryReason, shouldAutoApprove } from "@/lib/sites/boundaries";
import type { ContentElementType } from "@/generated/prisma/client";

const ALL_TYPES: ContentElementType[] = [
  "HEADLINE",
  "SUBHEADLINE",
  "BODY",
  "IMAGE",
  "CTA_LABEL",
  "CTA_HREF",
  "LOGO",
  "NAV_LABEL",
  "OTHER",
];

// product-spec.md §14. Every real ContentElementType must have a default —
// an element with no explicit override should never fall through to
// "undefined."
describe("DEFAULT_BOUNDARY_BY_TYPE", () => {
  it("has a default for every ContentElementType", () => {
    for (const type of ALL_TYPES) {
      expect(DEFAULT_BOUNDARY_BY_TYPE[type]).toBeDefined();
    }
  });

  it("matches product-spec.md §14's explicit examples", () => {
    expect(DEFAULT_BOUNDARY_BY_TYPE.LOGO).toBe("NEVER");
    expect(DEFAULT_BOUNDARY_BY_TYPE.HEADLINE).toBe("ALLOWED");
    expect(DEFAULT_BOUNDARY_BY_TYPE.SUBHEADLINE).toBe("ALLOWED");
    expect(DEFAULT_BOUNDARY_BY_TYPE.CTA_LABEL).toBe("ALLOWED");
    expect(DEFAULT_BOUNDARY_BY_TYPE.IMAGE).toBe("ALLOWED");
    expect(DEFAULT_BOUNDARY_BY_TYPE.NAV_LABEL).toBe("RESTRICTED");
  });
});

describe("effectiveBoundary", () => {
  it("falls back to the type default when there is no override", () => {
    expect(effectiveBoundary({ elementType: "LOGO", personalizationBoundary: null })).toBe("NEVER");
    expect(effectiveBoundary({ elementType: "HEADLINE", personalizationBoundary: null })).toBe("ALLOWED");
  });

  it("an explicit override always wins over the type default", () => {
    expect(effectiveBoundary({ elementType: "LOGO", personalizationBoundary: "ALLOWED" })).toBe("ALLOWED");
    expect(effectiveBoundary({ elementType: "HEADLINE", personalizationBoundary: "NEVER" })).toBe("NEVER");
    expect(effectiveBoundary({ elementType: "HEADLINE", personalizationBoundary: "RESTRICTED" })).toBe(
      "RESTRICTED",
    );
  });
});

describe("boundaryReason", () => {
  it("gives a real reason for every non-ALLOWED default type", () => {
    expect(boundaryReason("LOGO")).toBeTruthy();
    expect(boundaryReason("NAV_LABEL")).toBeTruthy();
    expect(boundaryReason("OTHER")).toBeTruthy();
  });

  it("has no reason for a type that defaults to ALLOWED", () => {
    expect(boundaryReason("HEADLINE")).toBeNull();
  });
});

// docs/roadmap.md Hardening: "accept all" -> opt-in AI auto-approval,
// scoped so it can never bypass a Restricted or Never boundary regardless
// of the site-level setting.
describe("shouldAutoApprove", () => {
  it("is true only when auto-approve is on AND the boundary is ALLOWED", () => {
    expect(shouldAutoApprove(true, "ALLOWED")).toBe(true);
  });

  it("is false when auto-approve is off, even for ALLOWED", () => {
    expect(shouldAutoApprove(false, "ALLOWED")).toBe(false);
  });

  it("is false for RESTRICTED regardless of the site setting", () => {
    expect(shouldAutoApprove(true, "RESTRICTED")).toBe(false);
    expect(shouldAutoApprove(false, "RESTRICTED")).toBe(false);
  });

  it("is false for NEVER regardless of the site setting", () => {
    expect(shouldAutoApprove(true, "NEVER")).toBe(false);
    expect(shouldAutoApprove(false, "NEVER")).toBe(false);
  });
});
