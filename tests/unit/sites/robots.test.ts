import { describe, it, expect } from "vitest";
import { isAllowedByRobots } from "@/lib/sites/robots";

describe("isAllowedByRobots", () => {
  it("allows everything when there are no disallow rules", () => {
    expect(isAllowedByRobots({ disallow: [] }, "/anything")).toBe(true);
  });

  it("blocks paths matching a disallow prefix", () => {
    const rules = { disallow: ["/admin", "/private"] };
    expect(isAllowedByRobots(rules, "/admin/dashboard")).toBe(false);
    expect(isAllowedByRobots(rules, "/private")).toBe(false);
    expect(isAllowedByRobots(rules, "/pricing")).toBe(true);
  });
});
