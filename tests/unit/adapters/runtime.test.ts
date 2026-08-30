import { describe, it, expect, vi } from "vitest";
import type { PageDefinition, ResolvedPage, VisitorContext } from "@dynamify/personalization-sdk";
import * as sdk from "@dynamify/personalization-sdk";
import { runStorefrontPersonalization } from "@/adapters/runtime";
import type { StorefrontAdapter } from "@/adapters/types";

function fakeAdapter(context: VisitorContext & { isBot: boolean }): {
  adapter: StorefrontAdapter;
  applied: ResolvedPage[];
} {
  const applied: ResolvedPage[] = [];
  const adapter: StorefrontAdapter = {
    platform: "SHOPIFY",
    detectContext: () => context,
    applyResolvedContent: (resolved) => {
      applied.push(resolved);
    },
  };
  return { adapter, applied };
}

const EMPTY_PAGE: PageDefinition = { id: "page-1", audiences: [], components: [] };

describe("runStorefrontPersonalization", () => {
  it("never fetches or applies anything for a detected bot", async () => {
    const { adapter, applied } = fakeAdapter({ isBot: true });
    const fetchPageDefinition = vi.fn().mockResolvedValue(EMPTY_PAGE);

    await runStorefrontPersonalization(adapter, fetchPageDefinition);

    expect(fetchPageDefinition).not.toHaveBeenCalled();
    expect(applied).toEqual([]);
  });

  it("resolves and applies content for a real visitor", async () => {
    const { adapter, applied } = fakeAdapter({ isBot: false, device: "desktop" });
    const fetchPageDefinition = vi.fn().mockResolvedValue(EMPTY_PAGE);

    await runStorefrontPersonalization(adapter, fetchPageDefinition);

    expect(fetchPageDefinition).toHaveBeenCalledOnce();
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ id: "page-1", components: [] });
  });

  it("strips isBot before the context ever reaches resolve()", async () => {
    const resolveSpy = vi.spyOn(sdk, "resolve");
    const { adapter } = fakeAdapter({ isBot: false, device: "mobile" });

    await runStorefrontPersonalization(adapter, async () => EMPTY_PAGE);

    expect(resolveSpy).toHaveBeenCalledOnce();
    const [contextArg] = resolveSpy.mock.calls[0]!;
    expect(contextArg).toEqual({ device: "mobile" });
    expect(contextArg).not.toHaveProperty("isBot");
    resolveSpy.mockRestore();
  });

  it("does nothing when the page fetch fails, rather than throwing", async () => {
    const { adapter, applied } = fakeAdapter({ isBot: false });
    const fetchPageDefinition = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(runStorefrontPersonalization(adapter, fetchPageDefinition)).resolves.toBeUndefined();
    expect(applied).toEqual([]);
  });

  it("does nothing when no page definition is found", async () => {
    const { adapter, applied } = fakeAdapter({ isBot: false });
    const fetchPageDefinition = vi.fn().mockResolvedValue(null);

    await runStorefrontPersonalization(adapter, fetchPageDefinition);

    expect(applied).toEqual([]);
  });
});
