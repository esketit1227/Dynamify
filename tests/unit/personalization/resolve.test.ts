import { describe, it, expect } from "vitest";
import { resolve } from "@dynamify/personalization-sdk";
import type { PageDefinition, VisitorContext } from "@dynamify/personalization-sdk";

function page(overrides: Partial<PageDefinition> = {}): PageDefinition {
  return {
    id: "page-1",
    audiences: [],
    components: [],
    ...overrides,
  };
}

describe("resolve", () => {
  it("renders the default when no rule matches", () => {
    const p = page({
      components: [
        {
          id: "c1",
          type: "HERO",
          order: 0,
          defaultContent: { headline: "Default headline" },
          variants: [],
          personalizationRules: [],
        },
      ],
    });

    const result = resolve({}, p);
    expect(result.components[0].content).toEqual({ headline: "Default headline" });
    expect(result.components[0].matchedVariantId).toBeUndefined();
  });

  it("renders the matching variant for a matching audience", () => {
    const p = page({
      audiences: [
        {
          id: "aud-1",
          rules: [{ id: "r1", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }],
        },
      ],
      components: [
        {
          id: "c1",
          type: "HERO",
          order: 0,
          defaultContent: { headline: "Default" },
          variants: [{ id: "v1", content: { headline: "Mobile headline" } }],
          personalizationRules: [
            {
              id: "pr1",
              audienceId: "aud-1",
              componentVariantId: "v1",
              priority: 0,
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    const result = resolve({ device: "mobile" }, p);
    expect(result.components[0].content).toEqual({ headline: "Mobile headline" });
    expect(result.components[0].matchedVariantId).toBe("v1");
  });

  it("breaks ties on explicit priority first", () => {
    const context: VisitorContext = { returning: true };
    const p = page({
      audiences: [
        { id: "aud-low", rules: [{ id: "r1", field: "returning", operator: "EQUALS", value: true, groupIndex: 0 }] },
        { id: "aud-high", rules: [{ id: "r2", field: "returning", operator: "EQUALS", value: true, groupIndex: 0 }] },
      ],
      components: [
        {
          id: "c1",
          type: "TEXT",
          order: 0,
          defaultContent: { body: "default" },
          variants: [
            { id: "v-low", content: { body: "low priority" } },
            { id: "v-high", content: { body: "high priority" } },
          ],
          personalizationRules: [
            {
              id: "pr-low",
              audienceId: "aud-low",
              componentVariantId: "v-low",
              priority: 10,
              updatedAt: new Date().toISOString(),
            },
            {
              id: "pr-high",
              audienceId: "aud-high",
              componentVariantId: "v-high",
              priority: 100,
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    const result = resolve(context, p);
    expect(result.components[0].content).toEqual({ body: "high priority" });
  });

  it("breaks equal-priority ties on specificity (larger AND-group wins)", () => {
    const context: VisitorContext = { device: "mobile", geo: { country: "FI" } };
    const p = page({
      audiences: [
        {
          id: "aud-broad",
          rules: [{ id: "r1", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }],
        },
        {
          id: "aud-specific",
          rules: [
            { id: "r2", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 },
            { id: "r3", field: "geo.country", operator: "EQUALS", value: "FI", groupIndex: 0 },
          ],
        },
      ],
      components: [
        {
          id: "c1",
          type: "TEXT",
          order: 0,
          defaultContent: { body: "default" },
          variants: [
            { id: "v-broad", content: { body: "broad" } },
            { id: "v-specific", content: { body: "specific" } },
          ],
          personalizationRules: [
            {
              id: "pr-broad",
              audienceId: "aud-broad",
              componentVariantId: "v-broad",
              priority: 0,
              updatedAt: new Date().toISOString(),
            },
            {
              id: "pr-specific",
              audienceId: "aud-specific",
              componentVariantId: "v-specific",
              priority: 0,
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    const result = resolve(context, p);
    expect(result.components[0].content).toEqual({ body: "specific" });
  });

  it("breaks equal-priority-and-specificity ties on most-recently-updated rule", () => {
    const context: VisitorContext = { returning: true };
    const older = new Date("2026-01-01T00:00:00Z").toISOString();
    const newer = new Date("2026-06-01T00:00:00Z").toISOString();

    const p = page({
      audiences: [
        { id: "aud-1", rules: [{ id: "r1", field: "returning", operator: "EQUALS", value: true, groupIndex: 0 }] },
      ],
      components: [
        {
          id: "c1",
          type: "TEXT",
          order: 0,
          defaultContent: { body: "default" },
          variants: [
            { id: "v-old", content: { body: "old rule" } },
            { id: "v-new", content: { body: "new rule" } },
          ],
          personalizationRules: [
            {
              id: "pr-a",
              audienceId: "aud-1",
              componentVariantId: "v-old",
              priority: 5,
              updatedAt: older,
            },
            {
              id: "pr-b",
              audienceId: "aud-1",
              componentVariantId: "v-new",
              priority: 5,
              updatedAt: newer,
            },
          ],
        },
      ],
    });

    expect(resolve(context, p).components[0].content).toEqual({ body: "new rule" });
  });

  it("breaks fully-tied rules deterministically on rule id, regardless of array order", () => {
    const context: VisitorContext = { returning: true };
    const timestamp = new Date().toISOString();
    const rulesA = [
      {
        id: "rule-aaa",
        audienceId: "aud-1",
        componentVariantId: "v-a",
        priority: 5,
        updatedAt: timestamp,
      },
      {
        id: "rule-bbb",
        audienceId: "aud-1",
        componentVariantId: "v-b",
        priority: 5,
        updatedAt: timestamp,
      },
    ];
    const rulesB = [...rulesA].reverse();

    const buildPage = (rules: typeof rulesA) =>
      page({
        audiences: [
          { id: "aud-1", rules: [{ id: "r1", field: "returning", operator: "EQUALS", value: true, groupIndex: 0 }] },
        ],
        components: [
          {
            id: "c1",
            type: "TEXT",
            order: 0,
            defaultContent: { body: "default" },
            variants: [
              { id: "v-a", content: { body: "a" } },
              { id: "v-b", content: { body: "b" } },
            ],
            personalizationRules: rules,
          },
        ],
      });

    const resultA = resolve(context, buildPage(rulesA));
    const resultB = resolve(context, buildPage(rulesB));
    expect(resultA.components[0].content).toEqual(resultB.components[0].content);
    expect(resultA.components[0].matchedRuleId).toBe("rule-aaa"); // lexicographically first
  });

  it("is deterministic — identical input always yields identical output", () => {
    const context: VisitorContext = { device: "mobile", utm: { source: "google" } };
    const p = page({
      audiences: [
        { id: "aud-1", rules: [{ id: "r1", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
      ],
      components: [
        {
          id: "c1",
          type: "HERO",
          order: 0,
          defaultContent: { headline: "default" },
          variants: [{ id: "v1", content: { headline: "mobile" } }],
          personalizationRules: [
            {
              id: "pr1",
              audienceId: "aud-1",
              componentVariantId: "v1",
              priority: 0,
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    const first = resolve(context, p);
    const second = resolve(context, p);
    expect(first).toEqual(second);
  });

  it("falls back to the default when a rule points at a variant that doesn't exist", () => {
    const p = page({
      audiences: [
        { id: "aud-1", rules: [{ id: "r1", field: "device", operator: "EQUALS", value: "mobile", groupIndex: 0 }] },
      ],
      components: [
        {
          id: "c1",
          type: "HERO",
          order: 0,
          defaultContent: { headline: "default" },
          variants: [], // no variants — the rule below references a nonexistent one
          personalizationRules: [
            {
              id: "pr1",
              audienceId: "aud-1",
              componentVariantId: "does-not-exist",
              priority: 0,
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    const result = resolve({ device: "mobile" }, p);
    expect(result.components[0].content).toEqual({ headline: "default" });
    expect(result.components[0].matchedVariantId).toBeUndefined();
  });

  it("falls back to the default when a rule references a nonexistent audience", () => {
    const p = page({
      audiences: [], // rule below references an audience that isn't here
      components: [
        {
          id: "c1",
          type: "HERO",
          order: 0,
          defaultContent: { headline: "default" },
          variants: [{ id: "v1", content: { headline: "should not appear" } }],
          personalizationRules: [
            {
              id: "pr1",
              audienceId: "does-not-exist",
              componentVariantId: "v1",
              priority: 0,
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    expect(() => resolve({}, p)).not.toThrow();
    expect(resolve({}, p).components[0].content).toEqual({ headline: "default" });
  });

  it("never throws even given a wildly malformed page definition", () => {
    const malformed = {
      id: "page-1",
      audiences: null,
      components: [
        {
          id: "c1",
          type: "HERO",
          order: 0,
          defaultContent: { headline: "default" },
          variants: undefined,
          personalizationRules: [{ id: "pr1" }],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(() => resolve({}, malformed)).not.toThrow();
  });

  it("orders components by their order field regardless of array order", () => {
    const p = page({
      components: [
        { id: "c-second", type: "TEXT", order: 1, defaultContent: {}, variants: [], personalizationRules: [] },
        { id: "c-first", type: "HERO", order: 0, defaultContent: {}, variants: [], personalizationRules: [] },
      ],
    });

    const result = resolve({}, p);
    expect(result.components.map((c) => c.id)).toEqual(["c-first", "c-second"]);
  });
});
