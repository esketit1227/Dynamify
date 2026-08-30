import { describe, it, expect, vi, afterEach } from "vitest";
import { assertSafeExternalUrl, safeFetch, UnsafeUrlError } from "@/lib/security/ssrfGuard";

describe("assertSafeExternalUrl", () => {
  it("rejects localhost", async () => {
    await expect(assertSafeExternalUrl("http://localhost:3000/hook")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects loopback and private IPv4 addresses", async () => {
    await expect(assertSafeExternalUrl("http://127.0.0.1/hook")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeExternalUrl("http://10.0.0.5/hook")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeExternalUrl("http://192.168.1.1/hook")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects the cloud metadata address", async () => {
    await expect(assertSafeExternalUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeExternalUrl("ftp://example.com/hook")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeExternalUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects malformed URLs without throwing an unrelated error", async () => {
    await expect(assertSafeExternalUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });

  it("accepts a normal public https URL", async () => {
    await expect(assertSafeExternalUrl("https://example.com/webhooks/dynamify")).resolves.toBeUndefined();
  });
});

describe("safeFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a redirect to a private/internal address instead of following it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://example.com/redirector")).rejects.toThrow(UnsafeUrlError);
    // Only the first hop was fetched — the unsafe redirect was never followed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a safe redirect chain and returns the final response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://example.com/final" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await safeFetch("https://example.com/start");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after too many redirects rather than looping forever", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://example.com/loop" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://example.com/loop")).rejects.toThrow(UnsafeUrlError);
  });
});
