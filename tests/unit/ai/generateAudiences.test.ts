import { describe, it, expect } from "vitest";
import { buildBusinessDescriptionFromUnderstanding, coerceToolAudiences } from "@/lib/ai/generateAudiences";

describe("buildBusinessDescriptionFromUnderstanding", () => {
  it("composes the crawl's understanding into one description", () => {
    const description = buildBusinessDescriptionFromUnderstanding({
      companySummary: "Acme sells project management software.",
      productSummary: "A Kanban-based tool for creative agencies.",
      targetCustomers: "Small creative agencies with 5-50 employees.",
      valueProps: ["Faster client approvals", "Built-in time tracking"],
    });

    expect(description).toContain("Company: Acme sells project management software.");
    expect(description).toContain("Product: A Kanban-based tool for creative agencies.");
    expect(description).toContain("Target customers: Small creative agencies with 5-50 employees.");
    expect(description).toContain("Value propositions: Faster client approvals; Built-in time tracking");
  });

  it("skips empty fields rather than emitting empty labels", () => {
    const description = buildBusinessDescriptionFromUnderstanding({
      companySummary: "Acme sells project management software.",
      productSummary: "",
      targetCustomers: "",
      valueProps: [],
    });

    expect(description).toBe("Company: Acme sells project management software.");
  });

  it("filters out non-string valueProps entries instead of throwing", () => {
    const description = buildBusinessDescriptionFromUnderstanding({
      companySummary: "Acme.",
      productSummary: "",
      targetCustomers: "",
      valueProps: ["Real prop", 42, null, { not: "a string" }],
    });

    expect(description).toBe("Company: Acme. Value propositions: Real prop");
  });

  it("tolerates a non-array valueProps value", () => {
    const description = buildBusinessDescriptionFromUnderstanding({
      companySummary: "Acme.",
      productSummary: "",
      targetCustomers: "",
      valueProps: "not an array",
    });

    expect(description).toBe("Company: Acme.");
  });

  it("caps the result at 1000 characters, matching generateAudienceProposalSchema's own cap", () => {
    const description = buildBusinessDescriptionFromUnderstanding({
      companySummary: "A".repeat(2000),
      productSummary: "",
      targetCustomers: "",
      valueProps: [],
    });

    expect(description.length).toBe(1000);
  });
});

// Verified live against the real Anthropic API (docs/roadmap.md): the model
// sometimes wraps `audiences` as a JSON string containing a second,
// self-referential `{ audiences: [...] }` object instead of the literal
// array the tool schema asks for — non-deterministically, not on every call.
describe("coerceToolAudiences", () => {
  it("passes a well-formed literal array through unchanged", () => {
    const audiences = [{ name: "Mobile visitors", description: "", rules: [] }];
    expect(coerceToolAudiences(audiences)).toBe(audiences);
  });

  it("unwraps a JSON string containing a self-referential {audiences} wrapper", () => {
    const inner = [{ name: "Mobile visitors", description: "", rules: [] }];
    const raw = JSON.stringify({ audiences: inner });
    expect(coerceToolAudiences(raw)).toEqual(inner);
  });

  it("unwraps a JSON string that's just the array itself", () => {
    const inner = [{ name: "Mobile visitors", description: "", rules: [] }];
    expect(coerceToolAudiences(JSON.stringify(inner))).toEqual(inner);
  });

  it("returns invalid JSON as-is, letting zod reject it the normal way", () => {
    expect(coerceToolAudiences("not json at all")).toBe("not json at all");
  });

  it("returns a JSON string with no recognizable array shape as-is", () => {
    const raw = JSON.stringify({ somethingElse: "no array here" });
    expect(coerceToolAudiences(raw)).toBe(raw);
  });

  it("passes through non-string, non-array values unchanged (e.g. null, numbers)", () => {
    expect(coerceToolAudiences(null)).toBeNull();
    expect(coerceToolAudiences(42)).toBe(42);
    expect(coerceToolAudiences(undefined)).toBeUndefined();
  });
});
