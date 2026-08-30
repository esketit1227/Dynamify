import { describe, it, expect, afterEach } from "vitest";
import { rateLimit } from "@/lib/auth/rateLimit";
import { resetDb } from "../setup/reset";

afterEach(async () => {
  await resetDb();
});

// Hardening (docs/roadmap.md): DB-backed, not in-memory — moved here from
// tests/unit/ since it now needs a real database (RateLimitBucket).
describe("rateLimit", () => {
  it("allows requests under the limit", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(key, { limit: 3, windowMs: 5000 })).allowed).toBe(true);
    }
  });

  it("blocks requests once the limit is hit", async () => {
    const key = `test-${Math.random()}`;
    await rateLimit(key, { limit: 2, windowMs: 5000 });
    await rateLimit(key, { limit: 2, windowMs: 5000 });
    const result = await rateLimit(key, { limit: 2, windowMs: 5000 });
    expect(result.allowed).toBe(false);
  });

  it("tracks distinct keys independently", async () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    await rateLimit(keyA, { limit: 1, windowMs: 5000 });
    expect((await rateLimit(keyA, { limit: 1, windowMs: 5000 })).allowed).toBe(false);
    expect((await rateLimit(keyB, { limit: 1, windowMs: 5000 })).allowed).toBe(true);
  });

  it("allows requests again once the window has elapsed", async () => {
    const key = `test-window-${Math.random()}`;
    expect((await rateLimit(key, { limit: 1, windowMs: 100 })).allowed).toBe(true);
    expect((await rateLimit(key, { limit: 1, windowMs: 100 })).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect((await rateLimit(key, { limit: 1, windowMs: 100 })).allowed).toBe(true);
  });

  // The thing a naive read-then-write implementation would get wrong —
  // the atomic INSERT ... ON CONFLICT (src/lib/auth/rateLimit.ts) exists
  // specifically so concurrent requests for the same key can't both read
  // "under limit" and both proceed.
  it("allows exactly `limit` successes under concurrent load for the same key", async () => {
    const key = `test-concurrent-${Math.random()}`;
    const limit = 5;
    const results = await Promise.all(
      Array(limit + 10)
        .fill(null)
        .map(() => rateLimit(key, { limit, windowMs: 5000 })),
    );
    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(limit);
  });
});
