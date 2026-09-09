import { describe, it, expect } from "vitest";
import { understandingSchema } from "@/lib/sites/understand";

function validInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    companySummary: "A company summary.",
    productSummary: "A product summary.",
    targetCustomers: "Small businesses.",
    brandTone: { tone: ["direct"], vocabulary: ["ship", "fast"], formality: "casual" },
    valueProps: ["Saves time"],
    primaryCta: "Get started",
    pages: [],
    ...overrides,
  };
}

// Reproduced live against the real Anthropic API (docs/roadmap.md): a real
// understandSite() call against elevenlabs.io failed 100% of the time with
// zero diagnostic detail because brandTone.formality ran a few characters
// over its 50-char cap, with nothing else wrong about the response. A hard
// .max() throws the whole result away over one field's cosmetic overage —
// truncate instead, same principle as designPage.ts's positioningAngles fix.
describe("understandingSchema — truncate, don't reject, on an over-length field", () => {
  it("truncates brandTone.formality instead of failing validation", () => {
    const result = understandingSchema.safeParse(
      validInput({
        brandTone: {
          tone: ["direct"],
          vocabulary: ["ship"],
          formality: "A".repeat(80),
        },
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandTone.formality.length).toBeLessThanOrEqual(50);
      expect(result.data.brandTone.formality.endsWith("...")).toBe(true);
    }
  });

  it("truncates an over-length tone/vocabulary array entry", () => {
    const result = understandingSchema.safeParse(
      validInput({ brandTone: { tone: ["A".repeat(80)], vocabulary: [], formality: "casual" } }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandTone.tone[0].length).toBeLessThanOrEqual(50);
    }
  });

  it("truncates over-length companySummary/productSummary/targetCustomers/valueProps/primaryCta", () => {
    const result = understandingSchema.safeParse(
      validInput({
        companySummary: "A".repeat(1200),
        productSummary: "B".repeat(1200),
        targetCustomers: "C".repeat(1200),
        valueProps: ["D".repeat(400)],
        primaryCta: "E".repeat(150),
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companySummary.length).toBeLessThanOrEqual(1000);
      expect(result.data.productSummary.length).toBeLessThanOrEqual(1000);
      expect(result.data.targetCustomers.length).toBeLessThanOrEqual(1000);
      expect(result.data.valueProps[0].length).toBeLessThanOrEqual(300);
      expect(result.data.primaryCta?.length).toBeLessThanOrEqual(100);
    }
  });

  it("leaves a well-formed input unchanged", () => {
    const result = understandingSchema.safeParse(validInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companySummary).toBe("A company summary.");
      expect(result.data.brandTone.formality).toBe("casual");
    }
  });

  it("still rejects a structurally wrong shape (not just a length issue)", () => {
    const result = understandingSchema.safeParse(validInput({ brandTone: "not an object" }));
    expect(result.success).toBe(false);
  });

  // Independently reproduced against fluencify.io, same day: 11
  // brandTone.vocabulary items against a hard .max(10) rejected an
  // otherwise-good result — an array-length overage, not a string-length
  // one, but the identical "don't discard a good result" bug. Truncates
  // to the first N rather than rejecting, same as the string fields above.
  it("truncates over-length tone/vocabulary/valueProps arrays instead of rejecting", () => {
    const result = understandingSchema.safeParse(
      validInput({
        brandTone: {
          tone: Array.from({ length: 15 }, (_, i) => `tone ${i}`),
          vocabulary: Array.from({ length: 11 }, (_, i) => `word ${i}`),
          formality: "casual",
        },
        valueProps: Array.from({ length: 11 }, (_, i) => `prop ${i}`),
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandTone.tone).toHaveLength(10);
      expect(result.data.brandTone.vocabulary).toHaveLength(10);
      expect(result.data.valueProps).toHaveLength(10);
      // Truncation keeps the first N, not an arbitrary subset.
      expect(result.data.valueProps[0]).toBe("prop 0");
      expect(result.data.valueProps[9]).toBe("prop 9");
    }
  });

  it("still rejects a structurally wrong shape for pages/classifiedElements (untouched by this fix)", () => {
    const result = understandingSchema.safeParse(
      validInput({ pages: [{ url: "https://example.com", classifiedElements: "not an array" }] }),
    );
    expect(result.success).toBe(false);
  });
});
