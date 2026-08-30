import { describe, it, expect } from "vitest";
import { matchAudience } from "@dynamify/personalization-sdk";
import type { AudienceDefinition, VisitorContext } from "@dynamify/personalization-sdk";

function audience(rules: AudienceDefinition["rules"]): AudienceDefinition {
  return { id: "aud-1", rules };
}

describe("matchAudience", () => {
  it("matches a single satisfied condition", () => {
    const result = matchAudience(
      { geo: { country: "FI" } },
      audience([{ id: "r1", field: "geo.country", operator: "EQUALS", value: "FI", groupIndex: 0 }]),
    );
    expect(result.matched).toBe(true);
    expect(result.specificity).toBe(1);
  });

  it("does not match when the condition fails", () => {
    const result = matchAudience(
      { geo: { country: "US" } },
      audience([{ id: "r1", field: "geo.country", operator: "EQUALS", value: "FI", groupIndex: 0 }]),
    );
    expect(result.matched).toBe(false);
  });

  it("treats a missing attribute as a non-match, not a throw", () => {
    const context: VisitorContext = {};
    const result = matchAudience(
      context,
      audience([{ id: "r1", field: "geo.country", operator: "EQUALS", value: "FI", groupIndex: 0 }]),
    );
    expect(result.matched).toBe(false);
  });

  it("EXISTS(false) matches specifically when the attribute is absent", () => {
    const result = matchAudience(
      {},
      audience([{ id: "r1", field: "geo.country", operator: "EXISTS", value: false, groupIndex: 0 }]),
    );
    expect(result.matched).toBe(true);
  });

  it("ANDs conditions within a group — all must match", () => {
    const context: VisitorContext = { geo: { country: "FI" }, device: "mobile" };
    const rules = audience([
      { id: "r1", field: "geo.country", operator: "EQUALS", value: "FI", groupIndex: 0 },
      { id: "r2", field: "device", operator: "EQUALS", value: "desktop", groupIndex: 0 },
    ]);
    expect(matchAudience(context, rules).matched).toBe(false);
  });

  it("ORs across groups — either group matching is enough", () => {
    const context: VisitorContext = { device: "mobile" };
    const rules = audience([
      { id: "r1", field: "geo.country", operator: "EQUALS", value: "FI", groupIndex: 0 },
      { id: "r2", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 1 },
    ]);
    expect(matchAudience(context, rules).matched).toBe(true);
  });

  it("specificity is the size of the largest matching AND-group", () => {
    const context: VisitorContext = { geo: { country: "FI" }, device: "mobile", returning: true };
    const rules = audience([
      { id: "r1", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 },
      {
        id: "r2",
        field: "geo.country",
        operator: "EQUALS",
        value: "FI",
        groupIndex: 1,
      },
      { id: "r3", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 1 },
      { id: "r4", field: "returning", operator: "EQUALS", value: true, groupIndex: 1 },
    ]);
    const result = matchAudience(context, rules);
    expect(result.matched).toBe(true);
    expect(result.specificity).toBe(3);
  });

  it("an audience with no rules never matches", () => {
    expect(matchAudience({ device: "mobile" }, audience([])).matched).toBe(false);
  });

  it("an unrecognized operator is a non-match, not a throw", () => {
    const rules = audience([
      // @ts-expect-error deliberately malformed for the test
      { id: "r1", field: "device", operator: "NOT_A_REAL_OPERATOR", value: "mobile", groupIndex: 0 },
    ]);
    expect(() => matchAudience({ device: "mobile" }, rules)).not.toThrow();
    expect(matchAudience({ device: "mobile" }, rules).matched).toBe(false);
  });

  it("IN matches against a list of values, case-insensitively", () => {
    const rules = audience([
      { id: "r1", field: "utm.source", operator: "IN", value: ["Google", "Bing"], groupIndex: 0 },
    ]);
    expect(matchAudience({ utm: { source: "google" } }, rules).matched).toBe(true);
    expect(matchAudience({ utm: { source: "yahoo" } }, rules).matched).toBe(false);
  });

  it("GREATER_THAN / LESS_THAN compare numeric custom attributes", () => {
    const rules = audience([
      {
        id: "r1",
        field: "attributes.companySize",
        operator: "LESS_THAN",
        value: 50,
        groupIndex: 0,
      },
    ]);
    expect(matchAudience({ attributes: { companySize: 10 } }, rules).matched).toBe(true);
    expect(matchAudience({ attributes: { companySize: 500 } }, rules).matched).toBe(false);
    expect(matchAudience({ attributes: { companySize: "not-a-number" } }, rules).matched).toBe(
      false,
    );
  });

  it("CONTAINS matches a substring of a string field", () => {
    const rules = audience([
      { id: "r1", field: "referrer", operator: "CONTAINS", value: "google", groupIndex: 0 },
    ]);
    expect(matchAudience({ referrer: "https://www.google.com/search" }, rules).matched).toBe(
      true,
    );
    expect(matchAudience({ referrer: "https://www.bing.com" }, rules).matched).toBe(false);
  });
});
