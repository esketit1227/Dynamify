# Open decisions

Unresolved questions with real consequences. Claude: do not resolve one silently
mid-task — surface it and wait. Once decided, record the choice and the reason,
and move it to the Decided section.

**2026-08-26 — architecture pivot.** The product changed from "Dynamify hosts
your page" to "Dynamify personalizes your existing website in place" (see
`docs/product-spec.md`, replaced same day). The D1–D6 decided below that
date were about *our own* page-serving strategy and no longer apply to
anything — kept at the bottom for history, not as guidance. Everything
above is the new open-question set for the new architecture.

---

## D5. Legal/consent surface of modifying a third party's live site — **flagging, not deciding**

This is a bigger version of the old D4: it's not a cookie on our own domain
anymore, it's AI-modified content shown to a customer's visitors on the
customer's own site, in their name. Worth real legal input before this
reaches real traffic: who's liable if generated copy is wrong or makes a
claim the company wouldn't stand behind; what the customer needs to
represent/warrant when they enable it; whether visitor-facing disclosure is
required anywhere. Not something to resolve in code — surfacing it so it
doesn't get silently skipped.

**Widened, Phase 6 (docs/roadmap.md):** IP-based firmographic enrichment
(`src/lib/enrichment/ipFirmographics.ts`) introduces a genuinely different
category this original framing didn't cover: collecting and briefly
caching a visitor's *IP address itself*, which several jurisdictions treat
as personal data on its own, separate from any question about the content
shown. Built with the most conservative posture that still works — off by
default per site (`Site.ipEnrichmentEnabled`), a 7-day cache TTL, no
visitor identity ever stored or linked to anything, company-level facts
only — but the underlying legal question (is this lawful to collect at
all, in which jurisdictions, does *this* need its own visitor-facing
disclosure) is exactly the kind of thing this entry exists to flag, not
resolve in code.

**Correction (docs/visitor-data.md pass, 2026-08-29):** the paragraph
above described the cache as "briefly caching" with "a 7-day cache TTL,"
which reads as if the TTL expired/deleted the row. It didn't: the TTL
only gated whether a *repeat lookup* re-hit the provider, and the raw IP
sat in `IpEnrichmentCache.ip` (plaintext, as the primary key)
indefinitely — no deletion mechanism existed. A real violation of
docs/visitor-data.md's own "Never capture: raw IP retained at rest" and
"Raw IP: never persisted; resolved to country/company in memory and
discarded," found while researching this section, not while looking for
it — fixed in the same pass: the cache is now keyed by a SHA-256 hash of
the IP (`hashIp`, same primitive `src/lib/auth/session.ts` uses for
tokens — the raw address is never written anywhere), and the TTL now
also drives real deletion (the same opportunistic, probabilistic,
hot-path-triggered cleanup pattern `RateLimitBucket` already used).

**Widened again, Hardening (2026-08-28) — decided for this one mechanism,
still flagged beyond it:** at the user's explicit request (asked directly,
not inferred from a UI mockup — see docs/roadmap.md's Hardening note), real
per-visitor identity was introduced: a random, non-PII, first-party
`dynamify_vid` cookie (`public/dynamify-embed.js`), off by default per site
(`Site.visitorTrackingEnabled`, same opt-in shape as the IP-enrichment
toggle above), backing a new `SiteVisitor` model and the dashboard's
Visitors page. This is a deliberate, one-time reversal of D7's "stay
anonymous" posture for sites that explicitly turn it on — D7's own
aggregate-analytics path is untouched and stays anonymous regardless. What
*is* decided: the mechanism itself (non-PII random id, explicit per-site
opt-in, cookie only ever set when the site has opted in). What is
**still** flagged, not resolved: whether enabling this creates a real
disclosure obligation beyond the existing informational cookie-banner
text, and the GDPR/CCPA exposure of persistent visitor-level tracking by
jurisdiction — a real customer should not flip this on without actual
legal review, the same caveat this entry has carried since Phase 6.

**Widened again (docs/visitor-data.md pass, 2026-08-29) — a real consent
mechanism now exists, most of this entry's "still flagged" questions
stay flagged:** requested directly (rebuild the Visitors page against
`docs/visitor-data.md`, a legal/architectural spec document), then asked
explicitly whether to build toward that doc's full schema or a page-only
refresh — the fuller option was chosen. Built: `Company`/`Person` models
(replacing a bare `company` string on `SiteVisitor`), a real three-way
consent object (`{necessary, analytics, personalization}`) threaded as
an input to `buildEffectiveContext`
(`src/lib/embed/service.ts`) rather than a wrapper around it — matching
the doc's own framing exactly — `VisitorSession`/`Impression`/
`Conversion` models capturing real per-visit detail and "what this
visitor was actually shown" (previously only reconstructable from a
JSON blob), configurable per-org retention windows enforced by the same
opportunistic cleanup pattern as `RateLimitBucket`, and real data-
subject-rights export/delete endpoints with a minimal write-side
`AuditLog`. A real, deliberate consent-model decision made along the
way: analytics consent gates the doc's "with consent" bucket
specifically (a *persistent* visitor identity/session history) — it does
**not** gate the pre-existing anonymous `SiteEvent` write, which the doc
itself lists under "Always (no consent needed)." Getting this wrong
first (gating the whole anonymous path) broke 23 existing tests and was
the tell that the design was wrong, not just the tests.

**Deliberately deferred, stated not silently dropped:** merging the two
embed endpoints (`elements`/`events`) into the doc's single `/collect` —
a large rewrite of a working, already-verified pipeline (holdout,
causal lift, cacheability semantics all depend on the current two-
endpoint shape) for no functional gain toward this task. HubSpot/
Salesforce/Klaviyo/Shopify/Segment CRM connectors and the generic
outbound webhook — no OAuth credentials exist in this environment for
any of them, and the doc itself stages CRM as a separate, later phase
from tracking. Real CMP-vendor-specific consent-signal parsing (Google
Consent Mode v2/IAB TCF) — `window.dynamify.setConsent()` is a real,
working gate a merchant's own CMP can call into, but parsing a specific
vendor's own signal format is ongoing integration work, not a one-time
build. **Still flagged, exactly as before:** whether any of this creates
a disclosure obligation beyond existing cookie-banner text, and
jurisdiction-by-jurisdiction GDPR/CCPA exposure — this entry's standing
instruction (get real legal review before real traffic) is unchanged by
building a more correct consent *mechanism*; a mechanism is not a legal
opinion.

---

## D6. Data model — repurpose the old Page/Component tables, or model fresh? — **decide before Phase 1's schema work**

The superseded architecture's `Page`/`PageVersion`/`Component`/
`ComponentVariant`/`PersonalizationRule` were built around pages *we host*
(draft/published/archived, our own versioning, our own publish action).
"A page on the customer's own site that we don't host and didn't create"
carries none of that. Leaning toward fresh models — `Site`, `CrawledPage`,
`ContentElement`, `ContentVariant` — rather than bending the old ones to fit
a meaning they weren't designed for. `Audience`/`AudienceRule` and the
`VisitorContext` resolution shape still fit conceptually as-is. Confirm
before writing the Phase 1 migration.

---

## Decided

### D1. Where does the content swap actually happen? — decided 2026-08-27

**Client-side embed script (option A).** One `<script>` tag, runs in the
visitor's browser, finds the matched DOM node, swaps its content after
load. Chosen for near-zero integration friction (no DNS/hosting change,
works on any customer stack) and a safe failure mode (script fails to load
→ visitor just sees the real, unmodified site).

Accepted consequences, going in with eyes open rather than by accident:
a brief flash of original content before the swap fires (mitigate the same
way the old resolution-location decision did — default-visible-then-swap,
never hide pending JS); search engines and no-JS visitors only ever see the
original page, never the personalized version — for a marketing-site
personalization tool this is probably fine (you may not want bots/SEO
crawling content that was never really "the page"), but it's worth
re-confirming with real customers rather than assuming; nothing is
server-rendered, so there's no true first-paint personalization.

The reverse-proxy/edge-render option (B) remains off the table for now —
revisit only if a customer's needs specifically require first-paint
personalization or JS-disabled support badly enough to justify the much
heavier DNS/TLS/critical-path integration it requires.

---

### D2 & D3. Node matching and re-verification — decided 2026-08-27

**Content-fingerprint verification, checked on every single invocation —
never cached or trusted between crawls.** The two decisions turned out to
be one mechanism: the fingerprint only earns its keep if it's actually
checked every time, so picking it settled D3 too.

**The algorithm** (this is what D2 asked to have written down before
implementation):

1. At crawl time (already happens — no schema change needed): store the
   CSS `selector` and the element's own content (`currentContent` — text
   for text-bearing types, the `href`/`src` for `CTA_HREF`/`IMAGE`/`LOGO`)
   per `ContentElement`, exactly as today.
2. At verification time — on *every* page load, not periodically:
   a. Resolve the selector against the live DOM.
   b. Require **exactly one** match. Zero or more than one means the
      element can't be safely identified — skip it, render the page
      untouched for that element.
   c. Read the live content off that one node the same way it was
      extracted at crawl time (normalized text, or the relevant
      attribute).
   d. Compare it **exactly**, post-normalization, against the stored
      `currentContent`. Match → verified, safe to apply an approved
      variant. Any difference at all → the page drifted since the crawl —
      skip, never guess, never force the swap onto a node whose content
      no longer matches what the personalization was authored against.

No separate cryptographic hash — the stored `currentContent` string *is*
the fingerprint, compared directly. Simpler and just as effective for this
purpose: the selector's own `nth-of-type` chain already disambiguates
*position* structurally, so the only thing left for the fingerprint to
verify is whether the *content* at that position has changed — a hash of
text-plus-structure would just be re-encoding information the selector
already carries.

Exact (not fuzzy) matching is deliberate: a single-character edit
invalidates the fingerprint and the element is skipped until the next
crawl picks up the change. That's the conservative choice CLAUDE.md's
"failure path renders the default" principle calls for here, "with extra
force" per D2's own framing — a missed personalization is invisible, a
wrong one is a broken customer site. Revisit toward fuzzy/similarity
matching only if exact-match proves too brittle in practice.

**Not yet implemented anywhere** — `applyPersonalizedSwaps`
(`src/lib/liveview/renderPreview.ts`), the one existing consumer of
selectors against live DOM, currently only checks step 2b (exactly one
match) and does **not** check 2c/2d (content drift) at all. Extracting a
shared, pure, unit-testable `verifyElement(selector, expectedContent, liveHtml)`
function that both `applyPersonalizedSwaps` and the future embed script
call is the natural first step of implementing this — same function, two
callers, no logic duplicated between the dashboard preview and the real
runtime.

Phase 2's own exit criterion depends on this: test it explicitly against a
site that changed after the crawl before considering Phase 2 done.

---

### D4. Brand-safety enforcement — decided 2026-08-27

**Both layers, in sequence.** A system prompt alone is necessary but not
sufficient — this is the one place in the product where a miss means the AI
said something false, in the customer's own voice, on their live site.

1. **Whitelist check first.** At understanding-time (alongside the existing
   `WebsiteUnderstanding`/heuristic pipeline), extract the approved
   facts/claims actually present in the Phase 1 crawl — named customers,
   partners, certifications, specific numbers/stats, product/feature names.
   Before a generated variant is even shown as an approvable proposal,
   check it for named entities or numeric claims that aren't in that
   whitelist. Cheap, deterministic, no extra model call, and catches the
   most damaging failure mode (inventing a customer or a stat) structurally
   rather than probabilistically.
2. **Model pass second**, only on what survives step 1. An independent
   call, separate system prompt, framed as fact-checking rather than
   copywriting: "does this text claim anything not present in the source
   material?" — given the original crawled content for that element as the
   only source of truth. Catches what a keyword whitelist can't (tone that
   overstates without inventing a fact, a paraphrase that subtly changes
   meaning).

A variant failing either layer never reaches a human as a proposal to
approve — it's rejected (or regenerated) before that point, the same
"failure path renders the default" posture used everywhere else in this
product, applied to generation instead of rendering. Where exactly this
plugs in: `src/lib/sites/suggestVariant.ts`'s `suggestWithAi` path (the
proposal-generation step Phase 3 builds its approval workflow around).

---

### D7. How to compute generic-vs-personalized conversion rate without a visitor-identity cookie — decided 2026-08-27

**Aggregate proxy, stay anonymous.** Each event — `PAGE_VIEW` and a new
`CTA_CLICK` — independently flags whether that rendering was personalized,
computed at record time from the same `resolve()` call already used for the
runtime swap. Conversion rate is a ratio, not a funnel: (personalized
`CTA_CLICK`s ÷ personalized `PAGE_VIEW`s) compared against (generic
`CTA_CLICK`s ÷ generic `PAGE_VIEW`s). No event is ever linked to another —
no visitor/session identity is introduced, so D5's legal/consent surface
stays exactly as flagged, not reopened. This is less precise than a true
per-visitor funnel (no drop-off path, no "this exact visitor converted"),
but it stays inside Phase 5's already-approved anonymous-events
architecture and answers the product's actual question ("does
personalization move the number") without it.

**Update, Hardening (2026-08-28):** real per-visitor identity now exists
(`SiteVisitor`, see D5's third widening above), but as an explicit,
separate, opt-in-per-site mechanism — this analytics path is unchanged and
still computes the ratio above with zero visitor linkage regardless of
whether any site has visitor tracking on. `SiteEvent.visitorId` is only
ever populated for a site that opted in; every prior consumer of this
model (analytics, recommendations) keeps working against fully anonymous
data either way.

---

### Superseded (old hosted-page architecture — 2026-08-26, no longer applicable)

The prior D1–D6 (personalization resolution location, flash of default
content, geo lookup, visitor identity/consent, specificity definition,
variant storage shape) were decided for a model where Dynamify hosted and
served the page. That model is superseded. The specificity-tiebreak
definition (count of matched conditions → most-recently-updated →
rule id) and the geo/identity postures may still be reusable verbatim once
the new architecture reaches the equivalent decisions — worth checking back
against rather than re-deriving from scratch — but they are not
re-affirmed here, since the surrounding architecture they were decided
inside of no longer exists.
