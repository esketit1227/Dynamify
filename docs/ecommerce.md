# Ecommerce personalization

**Status: foundation layer built (2026-08-28), everything else below is
still specification only.** Phase 6 of the core product is done, so the
timing gate this doc originally carried ("do not implement before Phase 6")
has passed. Built so far, at the user's explicit request, scoped
deliberately narrow ("foundation only" — see docs/roadmap.md's dated entry
for the full reasoning): the platform-agnostic adapter contract
(`src/adapters/types.ts`, `PlatformAdapter`/`StorefrontAdapter`), the
shared runtime orchestrator (`src/adapters/runtime.ts`,
`runStorefrontPersonalization` — the "shared JS SDK" in the diagram below),
encrypted-at-rest connection storage (`src/lib/security/encryption.ts`,
`PlatformConnection` model, `src/lib/platformConnections/service.ts`), and
a mock adapter proving the whole contract works without a real merchant
account. The unchanged personalization engine (`@dynamify/personalization-sdk`)
is consumed as-is by the new runtime, confirming it really is
platform-agnostic already.

**Explicitly not built**, so a future task doesn't assume otherwise: no
real Shopify/WooCommerce/Squarespace adapter (no Partner account exists
yet — see the open questions below, still open), no OAuth flow, no
dashboard route or UI (nothing real to connect to yet — wiring one now
would just be dead surface area), no catalogue sync/storage (the three
open questions below, including sync-vs-read-through, are still
unresolved — `PlatformConnection` deliberately stores no catalogue data
so it doesn't presuppose an answer).

Claude: this file exists so the architecture stays compatible with these
requirements, not so they get built early. If a Phase 0–5 task seems to need
something here, say so and wait rather than pulling it forward. The same
now applies to everything below the foundation layer described above:
don't build a real platform adapter, OAuth flow, or catalogue sync
opportunistically — that's real, separate work with its own external
dependencies (a Shopify Partner account, a dev store) the user hasn't
set up yet.

---

## Why this is a second product, not a bigger first one

On our own hosted pages we control the render path completely. Inside a
merchant's storefront we control almost none of it: content lives in the
platform's database, a theme we didn't write renders it, the platform CDN caches
it aggressively, and Google indexes it.

Every constraint below follows from that difference. Do not design ecommerce
personalization as "the page engine, pointed at Shopify."

---

## Hard rules

**Never personalize price.** Checkout is the platform's source of truth. A
personalized price the cart doesn't honor is a broken store and, in most
jurisdictions, a consumer-law problem. Personalize how price is *presented* —
bundle framing, which variant leads, whether shipping cost is surfaced early —
never the number itself.

**Never personalize the canonical product description.** Search engines index it.
Serving crawlers different content than users is cloaking. The description in the
platform database stays authoritative and is what bots receive.

Personalize instead: which benefit leads, which images order first, which
badges show, which reviews surface, which cross-sells appear, which section of
copy is expanded by default. These are merchandising decisions, and they don't
touch the indexed canonical text.

**Bots always get the default.** Detect crawler user agents and skip
personalization entirely. Log the decision so we can prove it.

**The merchant's store must work with us fully removed.** Uninstalling should
leave the theme exactly as it was. Never write personalized content back into the
platform's product records — no destructive migration of a merchant's catalogue.

---

## Architecture

The personalization engine stays platform-agnostic. It already takes a context
object and returns resolved content; it must not learn what Shopify is.

```
Storefront (any platform)
  → thin platform adapter (collects context, applies output)
  → shared JS SDK
  → engine (unchanged, pure)
```

Each platform gets an adapter implementing one interface: read visitor and
catalogue context, apply resolved variants to the DOM. Adapter code is confined
to `src/adapters/{shopify,woocommerce,squarespace}/`. If engine code needs a
platform conditional, the abstraction is wrong — stop and raise it.

Build the shared SDK and one adapter first. Shopify, because App Store
distribution is the strongest acquisition channel of the three and the app
review process will surface our worst assumptions early.

---

## Platform notes

**Shopify** — OAuth app, App Store distribution. Theme App Extension for
injection (not `ScriptTag`, which is deprecated for new work — verify current
status at build time). Product and customer data via Admin GraphQL. Respect
Shopify's mandatory GDPR webhooks and their performance budget; slow apps get
flagged in review. Personalize on collection and product pages, never at
checkout.

**WooCommerce** — WordPress plugin, self-hosted, so we inherit whatever else the
merchant has installed. Assume conflicting plugins and page caches. Must degrade
to defaults under full-page caching. Follow WordPress coding and security
standards for directory listing; never trust the merchant's PHP environment.

**Squarespace** — most constrained. Extension or code injection depending on
merchant plan; commerce API access is narrower than the other two. Expect to
support messaging and merchandising personalization only. Verify current
capabilities before committing — do not assume parity with Shopify.

---

## Feature scope

**Dynamic products** — reorder collection results, promote or demote items,
swap the featured product per visitor. Ranking is a pure function over catalogue
metadata plus visitor context. Inventory state must be respected: never promote
what can't be bought.

**Dynamic product content** — reorder benefits, select which images lead, choose
which reviews and badges show, pick which cross-sells appear. Canonical
description untouched, per the hard rules.

**Dynamic landing pages** — our hosted pages, pulling live catalogue data from
the connected store. This is the closest to existing work and should ship first
of the three.

---

## Security and data

Treat each connected store as untrusted input. Merchant catalogue text is
rendered to visitors, so it is an XSS vector — sanitize on the way out.

Store platform credentials encrypted at rest, scoped to the organization, never
exposed to any client. Request the minimum OAuth scopes; write scopes only if a
feature genuinely needs them, and none currently does.

Validate webhook signatures on every inbound call. Rate limit against each
platform's published limits and back off cleanly rather than getting the merchant
throttled.

We are a processor for merchant customer data. Support deletion and export
requests, honor the platform's data-request webhooks, and never retain shopper
personal data beyond what personalization requires.

---

## Performance budget

The storefront script is the merchant's page weight, not ours. Under 5KB gzipped
including the adapter. No blocking network calls on the critical path. If our
service is unreachable the storefront renders its normal content with no visible
delay and no console errors.

Every integration must be measured against the merchant's Core Web Vitals before
release. A personalization layer that costs a retailer LCP costs them revenue,
and they will remove it.

---

## Open questions

Recorded here rather than decided in code:

- Do we sync catalogue data into our database, or read through on request?
  Sync is faster and survives outages but adds staleness and storage duty.
- How do we attribute revenue when the merchant already runs GA4 and the
  platform's own analytics? Three sets of numbers that disagree is a support
  burden, not a feature.
- Do we support merchants running our hosted pages *and* their storefront, with
  one shared audience definition across both? Likely yes, and it affects the
  audience model — check before Phase 6 begins.
