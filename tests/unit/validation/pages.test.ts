import { describe, it, expect } from "vitest";
import { contentSchema, safeContentString } from "@/lib/validation/pages";

describe("safeContentString", () => {
  it("accepts ordinary text and http(s) URLs", () => {
    expect(safeContentString.safeParse("Sign up today").success).toBe(true);
    expect(safeContentString.safeParse("https://example.com/pricing").success).toBe(true);
  });

  it.each(["javascript:alert(1)", "  javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"])(
    "rejects dangerous URL scheme: %s",
    (value) => {
      expect(safeContentString.safeParse(value).success).toBe(false);
    },
  );
});

describe("contentSchema", () => {
  it("rejects a component content object with a script-scheme field", () => {
    const result = contentSchema.safeParse({ ctaHref: "javascript:alert(document.cookie)" });
    expect(result.success).toBe(false);
  });

  it("accepts a normal content object", () => {
    const result = contentSchema.safeParse({ headline: "Hello", ctaHref: "https://example.com" });
    expect(result.success).toBe(true);
  });
});
