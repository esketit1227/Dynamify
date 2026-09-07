import { describe, it, expect } from "vitest";
import { searchWeb, MarketResearchNotConfiguredError } from "@/lib/search/tavily";

// No TAVILY_API_KEY exists in this test environment (same posture as
// generateImage.test.ts's missing OPENAI_API_KEY / email/client.test.ts's
// missing RESEND_API_KEY) — what's meaningfully testable here is that
// searchWeb never even attempts a network call for an unconfigured
// provider. The real Tavily round-trip is verified live separately,
// against TAVILY_BASE_URL pointed at a local mock.
describe("searchWeb", () => {
  it("throws MarketResearchNotConfiguredError when TAVILY_API_KEY isn't set", async () => {
    await expect(searchWeb("Acme competitors")).rejects.toThrow(MarketResearchNotConfiguredError);
  });
});
