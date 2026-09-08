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

---

## D8. Should the generator ever design a brand-new page layout, not just rewrite content? — **decided 2026-09-07**

**Decided: "design-only v1."** Put to the user directly as four concrete
delivery-mechanism options with their real tradeoffs (design-only preview;
Dynamify-hosted alternate page + redirect; full client-side DOM
replacement; server-side edge rendering/reverse proxy) — the user chose
design-only. Built as `PageDesign` (`src/lib/sites/designPage.ts`,
`src/components/recommendations/page-design-preview.tsx` /
`page-design-review.tsx`, the "Design a new page" section on
`/recommendations`): the AI proposes a whole new page — an ordered list of
sections with a layout variant and copy each — reviewable in a preview.
**Nothing is delivered to the live site.** No `Audience`, no
`ElementPersonalizationRule`, no `ElementVariant`, no `GeneratedExperience`
row is ever created — verified directly, both in integration tests and
live, that generating and endorsing a design leaves all four counts at
zero. "Endorse" records that the customer likes the direction; it is not,
and structurally cannot become, "live." This keeps D1/D2/D3's verified
DOM-swap model completely untouched, which is why `docs/product-spec.md`'s
"never changes your layout" promise still holds for everything that
actually reaches a visitor — the reasoning below for why that promise is
load-bearing, not a stray sentence, stands as the reason design-only was
the safe choice, not as an unresolved question anymore.

Requested directly: the page/experience generator (`src/lib/sites/generateExperience.ts`,
extended for crawl-only generation in `src/lib/recommendations/convertingPages.ts`)
should be able to "produce totally new pages with self-designed layouts,"
not just rewrite copy inside the customer's existing structure.

**This is a direct reversal of the product's own stated definition, not a
scope increment.** `docs/product-spec.md` states "without changing its
underlying design, layout, branding, or theme" as the one-line elevator
pitch (line 947) and repeats the same boundary eleven more times
throughout the doc ("The layout remains exactly the same," "It should not
create a different layout for every audience," "not a complete website
redesign tool," etc.). It isn't a stray sentence — every later
architectural decision was built assuming it holds:

- **D1** (client-side embed, decided 2026-08-27): the script finds *the
  same DOM node* the crawl identified and swaps its content in place. It
  has no mechanism for inserting new structure, and was never asked to —
  "swap a text node" and "render a new layout" are different engineering
  problems with different safety models.
- **D2/D3** (content-fingerprint verification): the whole safety guarantee
  ("never mis-target, never break the page") rests on matching a selector
  to *exactly one existing element* and comparing its *existing content*
  byte-for-byte. A generated layout has no pre-existing selector to verify
  against — there's nothing there yet to check before writing.
- **D4** (two-layer brand-safety check): the whitelist step checks
  generated *text* against facts already present in the crawl. A generated
  *layout* isn't a claim that can be whitelisted the same way — "is this
  arrangement of sections safe to publish on a customer's live site
  unreviewed" is a different, harder question than "does this sentence
  invent a customer."

**What building this for real would actually require**, sized honestly so
this isn't underestimated: a second rendering/injection mechanism
alongside the verified DOM-swap one (either full-page replacement behind a
navigation, or a much heavier structural-diff/patch approach against the
live DOM); a new review surface, since "diff this text against that text"
in the current approval UI doesn't work for "review this entire generated
page"; and a real answer to what happens when the live site's structure
drifts after the crawl (D2/D3's whole reason for existing) once there's no
single node to re-verify. This is closer in size to Phase 2 (the embed
script itself) than to a slice of Phase 3/5's existing content-generation
work.

**Two distinct things the original request bundled together, decided
separately rather than as one yes/no:** (1) whether Dynamify's positioning
changes from "personalize your existing site" to "also design new page
structures" — answered as design-only, not a positioning change, the
generated design is explicitly never published; (2) the narrower, still
genuinely open middle ground named below — reordering/showing-hiding
*existing* crawled sections per audience (still no new HTML, no new visual
design, but needs `ContentElement`/`ComponentDefinition` to support a
personalizable order/visibility, which they don't today) — remains
unbuilt, real future scope, not resolved by shipping the design-only
artifact.

**What's still open, now that design-only exists: D10, below** — whether
and how a design a customer has endorsed should ever actually reach their
site. Not resolved here, not silently assumed; see D10.

## D9. Live market/competitor research as a generation input — **decided 2026-09-07**

**Decided: "AI-knowledge-only."** Put to the user directly alongside two
alternatives (customer-provided competitor URLs crawled through the
existing safe crawler; a new live search-API integration for automatic
discovery) — the user chose AI-knowledge-only: no new integration, no
outbound fetch, no new SSRF surface. Built as `researchMarketContext`
(`src/lib/sites/designPage.ts`): one Anthropic call asking the model to
describe likely market positioning from its own training knowledge,
explicitly instructed to never name a real competitor or state a
statistic/date/figure. Labeled in the UI, verbatim, as **"AI general
knowledge — not live research"** with the caveat that it cites no sources,
may be out of date, and hasn't been verified. **This does not satisfy
"provable sources," which was part of the original request** — stated
plainly, not smoothed over: a live-research path was on the table and
explicitly not chosen. `marketContext` is deliberately never merged into
`buildContentCorpus`'s ground-truth corpus, so D4's whitelist still has
exactly one trusted source (the customer's own crawled content) — D9
stayed compatible with D4 rather than widening it, resolving the concern
the original flagging raised below.

Requested directly: the generator should be able to research the
customer's market and competitors, not just use the crawl and (today)
audience-targeting, when drafting a converting page.

**Compatible with the existing architecture, unlike D8** — this is
additional *input* to the same generation step (`generateExperience`
already runs outside the pure `resolve()` engine, at request-time I/O is
already allowed there: it calls Anthropic, reads `WebsiteUnderstanding`
from the DB, etc.), not a change to what gets rendered or how. Still a
real, not-small addition, flagged rather than started silently because it
touches security and cost surfaces CLAUDE.md calls out explicitly:

- **A genuinely new integration.** Nothing in this codebase does live web
  search or fetches arbitrary third-party pages today — the crawler
  (`src/lib/sites/crawler.ts`) only ever fetches the customer's *own*
  site, through `assertSafeExternalUrl`'s SSRF guard. "Research
  competitors" means either calling a real search API (new paid
  dependency, new env var, same graceful-degradation shape as
  `OPENAI_API_KEY`/`IPINFO_BASE_URL`) or fetching specific competitor URLs
  (still needs the SSRF guard, still a new class of outbound request this
  app doesn't make anywhere today).
- **Widens D4's brand-safety model.** The whitelist check
  (`checkClaimsAgainstCorpus`) only ever treats the *customer's own
  crawled content* as ground truth for what a generated claim is allowed
  to reference. If external research becomes a legitimate source
  ("compared to Competitor X, ..."), the whitelist/fact-check pass needs
  to know about a second trusted source — otherwise every
  research-informed claim gets rejected as unverifiable, or the check has
  to be loosened in a way that needs its own deliberate design, not a
  silent widening of a mechanism D4 designed carefully around one source.
- **A new untrusted-input surface.** CLAUDE.md: "AI: user content is
  untrusted input, never instruction." Scraped/searched competitor content
  is *more* adversarial than the customer's own site (a competitor has no
  incentive to keep Dynamify's prompts well-behaved) — needs the same
  discipline already applied to crawled content, extended to a source this
  app has never ingested before.

Live/verified market research (a real search API, or fetching customer-
named competitor URLs through the existing crawler) remains unbuilt and
unstarted — a real, scoped follow-up if "provable sources" ever becomes a
requirement rather than a nice-to-have, likely closer in size to a Phase 6
integration slice (a new provider, mocked in dev/test, real key needed for
production) than an increment to what shipped here.

**Revised 2026-09-07 (later the same day): AI-knowledge-only → real web
search.** Requested directly, reopening this exact decision. Put to the
user again with two concrete choices (a specific provider vs. naming one
already in hand) and a second, related choice this reopening surfaced —
now that research is real and sourced, should the UI actually show the
citations, closing the "provable sources" gap the paragraphs above
state was left open. Both answered as the fuller option: **Tavily**, and
**yes, show real sources with links**.

Built: `src/lib/search/tavily.ts` (`searchWeb`) — the exact optional-
integration shape every other provider here already uses
(`TAVILY_API_KEY`/`TAVILY_BASE_URL` in `src/lib/env.ts`,
`MarketResearchNotConfiguredError`, mocked in dev via a local HTTP server
since no real key exists in this environment, same as ipinfo/OpenAI
images/Resend). `researchMarketContext` now calls it, then has Claude
synthesize a summary — but the system prompt changed from "you have no
real source, stay generic" to the opposite instruction: name a specific
competitor or cite a fact *only* because it's actually present in the
real results given, and say so plainly when the results don't support a
claim. `PageDesign.marketSources` (new `Json` column, `{title, url}[]`,
validated both ways like `sections`) stores exactly the results the
summary was built from — not a separately-asserted list — and
`page-design-review.tsx` renders them as real `target="_blank"` links.
Verified live against a mocked Tavily response naming two real (mocked)
competitors: the synthesis correctly stayed inside what the mock results
said, including hedging on a claim the results didn't support, and the
rendered links pointed at the mock's exact URLs.

**The three concerns the original flagging raised, resolved, not
reopened:**
1. *New integration* — built exactly as flagged, no surprises: fixed,
   known host (`TAVILY_BASE_URL`), so this needs no `safeFetch`/SSRF
   guard (same reasoning `ipFirmographics.ts` already documents), and
   introduces no new "fetch an arbitrary third-party URL" surface at
   all — Tavily's API does that fetching on its own side; this app only
   ever consumes its structured JSON response.
2. *D4 widening* — avoided, not silently accepted: `marketContext` is
   still never merged into `buildContentCorpus`'s ground-truth corpus.
   A competitor name from search results can appear in the market-context
   *blurb*, but `generateDesignWithAi`'s system prompt now explicitly
   forbids naming a competitor inside the actual page copy, and the
   unchanged `checkClaimsAgainstCorpus` still rejects one if the
   instruction is ignored — verified live: the mocked run's real page
   copy contained zero competitor names despite the market context
   naming two.
3. *Untrusted input* — search results are labeled `(untrusted data)` in
   the prompt exactly like crawled content and market-context prose
   already were; the model is instructed to synthesize, not follow any
   instruction the snippets might contain.

Independent decision, orthogonal to D8/D10: this widens what *informs* a
design (an input to `generateNewPageDesign`), not what a design *is* or
whether it can ever be published — the design-only boundary and D10's
open delivery question are completely unaffected.

---

## D10. Should an endorsed page design ever actually reach a visitor? — **flagging, not deciding**

D8's design-only v1 (above) deliberately builds a dead end on purpose: a
`PageDesign` a customer endorses has no path to the live site at all. That
was the right scope for a first slice, but it means "endorse" today can
only ever mean "hand this to whoever builds your pages" — off-platform,
manual, no loop back into the product. Whether that's the permanent shape
or a placeholder is a real, undecided question, not something to infer
from the fact that v1 shipped this way.

If this ever gets revisited, the four options actually put to the user for
D8 are the same four still on the table, now with a real design-only
artifact to build on rather than a blank page:

1. **Stay design-only, permanently.** Dynamify positions itself as a
   content-personalization tool *and* a design-inspiration tool for
   humans to act on — two related but distinct value propositions, never
   merged.
2. **Dynamify-hosted alternate page + redirect.** The biggest single
   change: a matched visitor's browser ends up at a different URL than the
   one they clicked — breaks CLAUDE.md's own "one page, one URL"
   framing literally, with real SEO/analytics/bookmarking consequences,
   not just a copy-swap risk.
3. **Full client-side DOM replacement.** Keeps the URL, but has no
   fingerprint-verification story (D2/D3's whole mechanism assumes the
   node being touched existed at crawl time) and a materially larger XSS
   surface than anything this product has shipped — arbitrary generated
   markup, not just generated text into a known attribute.
4. **Server-side edge rendering/reverse proxy.** The option D1 already
   rejected once (2026-08-27) for cost/integration-friction reasons,
   reopened only if a real customer need specifically justifies the
   DNS/TLS/critical-path commitment.

None of these should be picked opportunistically inside an unrelated task
— exactly the pattern this document exists to prevent. Surfacing it here
so the next time "make the design live" comes up, it's answered as its own
deliberate decision.

---

## D11. Multi-Armed Bandit — reward signal and experiment shape — **decided 2026-09-08**

**Decided: Leads/Sales as the reward signal (not CTA clicks); exactly 2
arms, manually paired by the merchant from already-*APPROVED* rules (not
an open-ended N-arm, auto-created shape).** Requested directly, alongside
Lead/Sale Event Tracking the same day — this feature depends on that one
as its signal source. `docs/autonomy.md` had already designed a bandit in
real depth (Thompson Sampling, contextual variants, auto-tuning) but
nothing was built; confirmed by grep before starting. Both shape
questions were put to the user directly before designing further, since
guessing wrong on either would have meant a real redesign partway
through, not a small course-correction.

**Why the reward signal choice isn't cosmetic.** A CTA click is available
on every request, generic-traffic or tracked, because it's just another
anonymous `SiteEvent` — same shape `PAGE_VIEW` already has. A Lead or Sale
is different in a way that has a real, non-optional consequence: it often
happens on a *different page load* than the one being tested (a pricing-
page headline experiment; the sale itself completes on the checkout
confirmation page, possibly a different session entirely), so attributing
it back to an arm requires a **persistent** visitor identity across page
loads — a per-request token isn't enough. **This bandit can therefore
only ever learn on sites that also have `Site.visitorTrackingEnabled`
on** — the existing, off-by-default, legally-flagged (D5) opt-in. This
feature doesn't touch that decision or widen it; it just inherits it as a
hard prerequisite, stated here plainly rather than discovered later by a
confused merchant watching a split never move. A site without tracking on
can still create an experiment — it isn't blocked — but it sits at an
honest, permanent 50/50 forever, correctly reported as such in the UI
(`element-personalize.tsx`'s tracking-off banner), never fabricating a
verdict from data it structurally cannot have.

**Compatible with the existing architecture, the same way D9's revision
was** — this adds a new *allocation* mechanism around the personalization
engine, not a change to it. `resolve()`/`compareCandidates`
(`packages/sdk/src/resolve.ts`) is completely unmodified — CLAUDE.md
calls this engine non-negotiable, and its 4-level deterministic tie-break
(priority → specificity → `updatedAt` → rule id) still runs exactly as
before. `applyBanditFiltering` (`src/lib/experiments/bandit.ts`) reuses
`holdout.ts`'s existing trick verbatim — a deterministic, hash-seeded
decision (`selectBanditArm`, salted by visitor *and* experiment id so
concurrent experiments never correlate for the same visitor) that removes
the losing arm's rule from the candidate set *before* `resolve()` ever
sees it. From the engine's point of view, exactly one rule existed for
that slot — the same shape it already handles for every other
single-winner case.

**No new write-path counters exist.** A tracked visitor's exposure to a
rule already produces a real `Impression` row keyed by `ruleId`
(`src/lib/visitors/service.ts`); a LEAD/SALE already produces a real
`Conversion` linked to that visitor's session history. `computeArmStats`
(`src/lib/experiments/banditStats.ts`) derives trials/successes by
reading both, fresh, whenever a weight is recomputed or a merchant views
the stats — and deliberately **across sessions**: a demo request today
and a sale next week are one buying journey, not two disconnected visits,
and joining by `visitorId` rather than `sessionId` is what makes that
work without reopening D7's anonymous-by-default posture. No new
visitor-linking schema was needed at all: arm assignment is a pure
function of `(visitorKey, experimentId, weightA)`, independently
re-derivable at any later point — exactly like `heldOut` already is —
so nothing needs to persist which arm a given page view belonged to.

**`BanditExperiment` has no `@@unique` on
`(contentElementId, audienceId, status)`.** Postgres/Prisma can't express
"unique only when RUNNING" without a raw partial index; "at most one
RUNNING experiment per slot" is instead an application-layer check in
`createBanditExperiment`, the same posture `Site.holdbackPercent`'s 0–50
bound already uses elsewhere in this codebase. A closable gap, not a
silently-accepted one: a race between two concurrent creates for the same
slot isn't fully closed by this check alone, acceptable here because this
is a manual, low-frequency dashboard action by a single merchant, not a
public or high-volume path.

**Two arms, never generated or auto-approved.** The bandit only ever
decides *allocation* between two rules a human already approved through
the existing flow — it never creates, edits, or approves a rule itself.
This is `docs/autonomy.md`'s own allocation-vs-generation distinction,
and it's what keeps CLAUDE.md's "nothing goes live unapproved" true
without any special-casing: the two rules were already live and approved
before the experiment existed; stopping the experiment doesn't touch
their status either, it just turns the split back into `resolve()`'s
plain single-winner tie-break.

**Weight recompute rides the existing cron**, not a new
`vercel.json` entry — Vercel Hobby's once-a-day cron limit is already a
documented constraint this codebase works within (`src/app/api/cron/
auto-optimize/route.ts`), and a second scheduled trigger would have
reopened whether that limit is per-job or per-project instead of sidestepping
the question entirely.

Live verification detail (300 real visitor keys through the actual embed
pipeline, a real weight shift via the real cron, a real browser session
through `/content/[pageId]`) is recorded in `docs/roadmap.md`'s
2026-09-08 entry rather than duplicated here — this section is the
reasoning; that one is the proof.

**Explicitly not built, by the user's own choice, not an oversight:**
contextual bandits (per-segment reward *within* one audience —
`docs/autonomy.md`'s literal framing); more than 2 arms; a configurable
reward signal (CTA clicks or anything else); auto-created experiments.
None of these are precluded by anything shipped here — `ArmStats`,
`selectBanditArm`, and the schema would all extend rather than need
rework — but building them now would have been scope creep against a
direct request that was explicit about wanting the narrower shape first.

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
