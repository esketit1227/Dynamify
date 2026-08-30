import { resolve } from "@dynamify/personalization-sdk";
import type { PageDefinition } from "@dynamify/personalization-sdk";
import type { StorefrontAdapter } from "./types";

// The "shared JS SDK" from docs/ecommerce.md's architecture diagram: the
// one piece of orchestration every platform's StorefrontAdapter plugs
// into, so the engine itself (`resolve`, imported unchanged from
// @dynamify/personalization-sdk) never has to learn what a storefront
// platform is. This is the platform-agnostic equivalent of
// public/dynamify-embed.js's run() — same shape, parameterized by an
// adapter instead of hardcoded DOM calls.
//
// Never throws, never blocks the storefront: a fetch failure or a missing
// page just means the merchant's normal content stays exactly as it was,
// same failure posture as the existing embed script and CLAUDE.md's "a
// published page must never break because personalization failed."
export async function runStorefrontPersonalization(
  adapter: StorefrontAdapter,
  fetchPageDefinition: () => Promise<PageDefinition | null>,
): Promise<void> {
  const { isBot, ...context } = adapter.detectContext();
  // Hard rule (docs/ecommerce.md): bots always get the default, so indexed
  // content matches what search engines actually see. Decided here, once,
  // rather than trusted to every adapter's own discretion.
  if (isBot) return;

  let page: PageDefinition | null;
  try {
    page = await fetchPageDefinition();
  } catch {
    return;
  }
  if (!page) return;

  const resolved = resolve(context, page);
  adapter.applyResolvedContent(resolved);
}
