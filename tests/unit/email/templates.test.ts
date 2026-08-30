import { describe, it, expect } from "vitest";
import { passwordResetEmail } from "@/lib/email/templates";

describe("passwordResetEmail", () => {
  const resetUrl = "https://app.dynamify.com/reset-password?token=abc123";

  it("includes the reset link in both the html and text bodies", () => {
    const { html, text } = passwordResetEmail(resetUrl);
    expect(html).toContain(resetUrl);
    expect(text).toContain(resetUrl);
  });

  it("has a clear, non-empty subject", () => {
    const { subject } = passwordResetEmail(resetUrl);
    expect(subject.length).toBeGreaterThan(0);
    expect(subject.toLowerCase()).toContain("password");
  });

  it("mentions the link is single-use and time-limited, and reassures a non-requester", () => {
    const { text } = passwordResetEmail(resetUrl);
    expect(text).toContain("expires");
    expect(text.toLowerCase()).toContain("didn't request");
  });

  it("produces well-formed html with the link as a real href", () => {
    const { html } = passwordResetEmail(resetUrl);
    expect(html).toContain(`href="${resetUrl}"`);
    expect(html).toContain("<!doctype html>");
  });
});
