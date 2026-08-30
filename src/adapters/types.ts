import type { VisitorContext, ResolvedPage } from "@dynamify/personalization-sdk";

// The platform-agnostic contract every real adapter (src/adapters/shopify/,
// src/lib/…woocommerce, …squarespace — none built yet) implements. Nothing
// here imports or references a specific platform's SDK/API shape — if an
// adapter needs to leak a platform detail into these types, the
// abstraction is wrong (docs/ecommerce.md's own rule for this boundary).
//
// Two separate contracts, matching the doc's architecture diagram:
// `Storefront -> thin platform adapter -> shared JS SDK -> engine`.
// PlatformAdapter is server-side (connects a store, reads its catalogue).
// StorefrontAdapter is the browser-side half (collects context, applies
// output) — the ecommerce equivalent of public/dynamify-embed.js, but
// generic across platforms instead of hand-rolled per site.

export type PlatformType = "SHOPIFY" | "WOOCOMMERCE" | "SQUARESPACE";

// Raw, pre-encryption shape — adapter-defined (a Shopify adapter's
// credentials look nothing like a WooCommerce one). Encrypted at rest by
// the caller (src/lib/platformConnections/service.ts), never by the
// adapter itself — connecting and encrypting are separate concerns.
export type PlatformCredentials = Record<string, string>;

export type ConnectResult = {
  externalStoreId: string;
  credentials: PlatformCredentials;
};

export type CatalogueItem = {
  externalId: string;
  title: string;
  // Inventory only — never a price. Hard rule (docs/ecommerce.md): "never
  // personalize price." This type doesn't carry one at all, so a future
  // adapter can't accidentally wire price into anything personalization
  // touches; ranking/promotion logic still needs to know what's buyable.
  available: boolean;
  imageUrls: string[];
};

export interface PlatformAdapter {
  readonly platform: PlatformType;
  // Exchanges whatever a merchant provides (an API key, an OAuth code —
  // adapter-defined `input`) for a stored connection. Real OAuth (Shopify's
  // app-install redirect flow) is future work; this signature already
  // fits it (`input` would carry the OAuth code) without changing shape.
  connect(input: Record<string, string>): Promise<ConnectResult>;
  fetchCatalogueSnapshot(credentials: PlatformCredentials): Promise<CatalogueItem[]>;
}

// Runs in the merchant's storefront, in the visitor's browser.
export interface StorefrontAdapter {
  readonly platform: PlatformType;
  // isBot is decided by the adapter (each platform's crawler-detection
  // signals differ) — never inferred by the shared runtime below. Hard
  // rule (docs/ecommerce.md): "bots always get the default," enforced by
  // runStorefrontPersonalization refusing to call resolve() at all when
  // this is true, not by trusting the adapter to skip on its own.
  detectContext(): VisitorContext & { isBot: boolean };
  applyResolvedContent(resolved: ResolvedPage): void;
}
