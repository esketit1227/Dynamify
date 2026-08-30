import { describe, it, expect } from "vitest";
import { safeContentString } from "@/lib/validation/pages";

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
