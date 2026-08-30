import { describe, it, expect } from "vitest";
import { sendEmail } from "@/lib/email/client";
import { EmailNotConfiguredError } from "@/lib/email/errors";

// No RESEND_API_KEY exists in this test environment (same posture as
// generateImage.test.ts's missing OPENAI_API_KEY) — what's meaningfully
// testable here is that sendEmail never even attempts a network call for
// an unconfigured provider. The real Resend round-trip is verified live
// separately, against RESEND_BASE_URL pointed at a local mock — see
// docs/roadmap.md's entry for this feature.
describe("sendEmail", () => {
  it("throws EmailNotConfiguredError when RESEND_API_KEY isn't set", async () => {
    await expect(
      sendEmail({ to: "someone@example.com", subject: "Test", html: "<p>Test</p>", text: "Test" }),
    ).rejects.toThrow(EmailNotConfiguredError);
  });
});
