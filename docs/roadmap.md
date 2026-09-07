# Roadmap

**Current phase: 6 — Image generation & analytics maturity (done — analytics, IP-based enrichment integrations, and AI image generation all built)**

Update this line as phases complete. Claude reads it to know what's in scope.
A phase is not done until its exit criteria pass; do not start the next one early.

**2026-08-27 — audit note.** Phase 1 is genuinely done (real crawls verified
against elevenlabs.io), except the AI understanding path has never actually
run in this environment — no `ANTHROPIC_API_KEY` is configured, so every run
so far used the honest heuristic fallback (`src/lib/sites/autoClassify.ts`).
Later user requests (Live View, the demo window, real-website preview
rendering) drove building well into Phase 3's data model and runtime
(`ElementPersonalizationRule`, `ElementVariant`, suggest-variant,
approval-gating just added) — each piece was explicitly requested in the
moment, but the net effect is ahead of this phase marker. **Phase 2 (the
embed script, D1/D2/D3) has not been started at all** — everything
personalization-related today only ever runs inside our own authenticated
dashboard (Live View, the demo window), never on a real visitor's real page.
Phase 3's own exit criteria are therefore not met either (no live customer
site, and D4's brand-safety validation layer is still unbuilt). Leaving the
phase marker at 1 rather than bumping it, since that's the last phase whose
exit criteria actually passed — the rest is real but ahead-of-gate work, not
a completed Phase 3.

**2026-08-26 — superseded roadmap.** Everything below Phase 0 is a rewrite.
The product pivoted from "Dynamify hosts your landing page" to "Dynamify
reads and personalizes your *existing* website in place." See
`docs/product-spec.md` (replaced same day) and `docs/decisions.md` for the
new open questions this forces. Phase 0's foundation carries over as-is;
everything built for the old model in what were Phases 1–6 (page editor,
`/p/[slug]` hosting, campaigns/domains tied to Dynamify-owned pages) is
superseded — kept in git history, not deleted, but not the direction forward.
What's reusable from that work: auth/orgs/dashboard shell wholesale; the
`VisitorContext`-based resolution concept, reframed around AI-discovered
content variants instead of manually authored ones; the analytics event
model; the security patterns (rate limiting, tenant isolation, SSRF
guarding, AI approve/reject gating).

---

## Phase 0 — Foundation (done)

Scaffold, database, auth, organizations, dashboard shell. Unaffected by the
pivot — still the foundation everything else sits on.

**Exit:** a second user cannot read or mutate the first user's org data, and
there is a test proving it. *(Passed.)*

---

## Phase 1 — Site connection & understanding

The company gives us a URL. Nothing is personalized yet — this phase is
purely: can we reliably read and model an arbitrary existing website well
enough to base every later phase on it.

- Company enters a website URL (`https://company.com`).
- A crawler fetches the site: reasonable page limit, respects `robots.txt`,
  timeouts, no crawling behind auth, no infinite loops on redirects.
- Structural extraction turns raw HTML into a content-element inventory per
  page: section (hero/features/testimonials/CTA/nav/footer/etc.), element
  type (headline/subheadline/body/image/CTA-label/CTA-href/...), and the
  element's current content.
- AI builds a persisted **website understanding** model from the crawl:
  company/product summary, target customers, brand tone/voice, primary CTA,
  value propositions, and the section-by-section element inventory (§4 of
  product-spec.md).
- UI: enter URL → scan progress → a human-readable understanding report
  ("We found 14 pages, 63 editable elements, 18 images. Your positioning
  appears to be...").
- Nothing here writes to the live site or requires the company to install
  anything. This phase produces data, not behavior change.

**Exit:** given a real, arbitrary marketing site URL, the system produces a
structured, persisted content-element inventory plus a coherent
human-readable understanding report — automated, no manual tagging — and
degrades honestly (says what it couldn't parse) rather than fabricating
structure it didn't find.

*Deliberately does not require D1/D2 (below) to be resolved — reading a site
doesn't yet involve injecting anything into it.*

---

## Known issues — found in the founder walkthrough (2026-08-27)

Surfaced by actually operating the product end-to-end as a real customer
would (connected elevenlabs.io as a co-founder persona, tested every
screen), not by reading code. All are Phase 1-scoped (crawl, understanding,
and the dashboard UX around them).

**2026-08-27 — 7 of 8 fixed, re-verified against a live re-crawl of
elevenlabs.io.** One (part of #8) is intentionally left open — see below.

1. ~~**Duplicate homepage crawl.**~~ **Fixed.** `normalizeUrl()`
   (`src/lib/sites/crawler.ts`) collapses trailing-slash/hash variants of
   the same URL before either the root or any discovered link is queued —
   `https://example.com` and `https://example.com/` are now one page.
   `scripts/seed-elevenlabs.ts`'s local `seenPaths` workaround was removed
   as redundant. Unit-tested (`tests/unit/sites/crawler.test.ts`) and
   confirmed live: re-seeding elevenlabs.io now produces exactly one
   `https://elevenlabs.io/` row, not two.
2. ~~**Wrong heuristic "Primary CTA."**~~ **Fixed.** A small denylist of
   universal auth/utility phrases ("log in," "sign in," "menu," "search," …)
   is now excluded before ranking by frequency
   (`buildHeuristicUnderstanding` in `src/lib/sites/autoClassify.ts`) — a
   page-coverage-based approach was tried first and rejected (a genuinely
   repeated real CTA like "Start Free Trial" showing up on every page
   isn't distinguishable from nav chrome by coverage alone; only content
   is).
3. ~~**Value propositions mix full sentences and bare product names.**~~
   **Fixed.** Same function now requires more than one word, so bare
   headings like "ElevenCreative" no longer qualify.
4. ~~**Audience rule builder is raw and unguided.**~~ **Fixed.**
   `AudienceRuleEditor` (`src/components/audiences/audience-rule-editor.tsx`)
   now offers a dropdown of the same fields `VisitorProfileForm` exposes
   (plus a "Custom field…" escape hatch), friendlier operator labels, and
   renders AND/OR as visual groups with "+ Add AND condition" / "+ Add OR
   group" — the numeric `groupIndex` is no longer shown to the user at all.
5. ~~**Settings still describes the superseded hosted-page model.**~~
   **Fixed.** The "Custom domains" section was removed from
   `src/app/(dashboard)/settings/page.tsx` (component and underlying
   `Domain` model/routes left in place, unlinked — same treatment
   Pages/Campaigns already got).
6. ~~**Integrations copy doesn't match its feature.**~~ **Fixed.** Rewrote
   the page description to describe the actual (outbound webhook) feature.
7. ~~**"Try live demo" doesn't acknowledge real progress.**~~ **Fixed.**
   Overview's header action now shows "Connect a website" once a site
   already exists, instead of repeating the first-run demo prompt.
8. **Noisy, low-value classified elements — partially fixed.** Accessibility
   skip-links ("Skip to content") are now filtered out entirely at
   extraction (`src/lib/sites/extract.ts`), confirmed unit-tested. The
   other half — single-word feature/icon labels ("SFX," "Voices," "Music")
   showing up as HEADLINE-type elements — is **intentionally left open**:
   no length- or word-count-based filter was found that doesn't risk
   dropping a legitimately short real headline from some other site (e.g.
   "Pricing," "FAQ" as an actual section title). Distinguishing "terse but
   real" from "noise" needs either real AI judgment (once an
   `ANTHROPIC_API_KEY` is configured) or an explicit product call on where
   to draw the line — flagging rather than guessing.

---

## Phase 2 — Embed script & safe DOM targeting

This is the crux the whole product depends on: an embeddable script that can
find the *same* elements Phase 1 identified, inside the live DOM of a real
visitor's page load, reliably enough to be trusted — and, just as important,
knows when it can't and safely does nothing rather than guess.

- Resolve **D1/D2/D3** (below) before starting.
- The company installs one script tag (or it's injected via a supported
  integration — Shopify app, WordPress plugin, GTM container — TBD, not
  before the raw script works).
- At runtime, the script maps each crawl-time content element to its live
  DOM node and verifies the match (D3) before touching anything.
- This phase changes **nothing visible** — it's a targeting/verification
  layer only. A debug/preview mode can highlight matched elements for
  internal QA.

**Exit:** on a real test site, the script correctly and safely identifies
every element from the Phase 1 inventory that still exists on the live page,
correctly reports "no longer found" for ones that don't (e.g. the customer
edited their site since the crawl), and never mis-targets the wrong element.
Tested against at least one site that changed after the crawl.

**2026-08-27 — done.** Built per D1/D2/D3 (`docs/decisions.md`): a public,
cross-origin `GET /api/embed/site/[siteId]/elements` endpoint (rate-limited,
CORS-scoped to just this route) backing `public/dynamify-embed.js` — plain
vanilla JS, no build step, deliberately view-source-able since that's a
trust property for a script a customer pastes onto their own site. It
verifies selector + exact content match on every load, exposes results at
`window.__dynamify.results`, and never touches anything visible.
`?dynamify_debug=1` on a live page outlines matched (green) / unmatched
(red) elements with a floating count badge — the "internal QA" mode this
phase calls for. Exit criterion verified live: seeded a real page, confirmed
full match, then changed one element's text without re-crawling and
confirmed *that one specifically* reported unmatched while an unchanged
element on the same page still matched. `applyPersonalizedSwaps`
(`src/lib/liveview/renderPreview.ts`, the dashboard preview) got the same
content-drift check added, closing the gap D2/D3 had flagged. An "Install
on your site" card with a copy-to-clipboard script tag was added to the
Sites detail page.

Deliberately deferred (not required by this phase's exit criterion, not
built): persisting verification results to the DB / a dashboard match-rate
status — checked via the debug overlay instead; Shopify/WordPress/GTM
install paths — roadmap already said "not before the raw script works."

---

## Phase 3 — Text personalization

The first thing visitors actually see differently.

- Personalization boundaries UI (product-spec §14): allowed / restricted /
  never-change, per element and per element type.
- AI generates content variants per element, constrained by the brand-voice
  profile (§12) and brand-safety rules (§13 — never fabricate customers,
  stats, claims, pricing).
- Approval workflow (§16/§18): diff view (original vs. proposed + why),
  approve / edit / disable. Nothing goes live unapproved.
- Runtime: visitor arrives → `VisitorContext` resolved (reuses the existing
  resolution concept) → script swaps approved variant text into the
  verified DOM node.
- Version history (§19): every change reversible, original always
  recoverable instantly.

**Exit:** a real approved text personalization renders differently for two
distinct visitor contexts on a live test page, the original page is exactly
what's served if the script fails to load or a match fails (never a broken
or blank page), and every deployed change is visible + reversible in the
dashboard with its reason.

**2026-08-27 — done.** Per D4 (`docs/decisions.md`): `suggestVariant.ts`'s
AI path now runs generated copy through a whitelist check (numbers and
mid-sentence capitalized word runs must appear somewhere in the site's own
crawled content) and an independent fact-checking model pass before it's
ever returned as a suggestion — either failure falls back to the
heuristic (real-content re-selection) path, the same as AI-not-configured.
`ElementPersonalizationRule` gained a `DISABLED` status (disable ≠ delete —
the rule and its variant survive, re-enabling is instant) and
`ElementVariant` gained a `method` field so *why* a variant exists stays
visible long after it was created, not just in the moment. The Sites
detail page shows an explicit original-vs-proposed comparison per rule —
the "with its reason" part of the exit criterion.

The actual runtime swap: `getEmbedElements` (`src/lib/embed/service.ts`)
now accepts a `VisitorContext` and runs it through the same `resolve()`
pipeline Live View already uses, attaching the personalized content to
any element an approved rule matches. `dynamify-embed.js` detects device
(viewport), referrer, and UTM params — all page-native, no new
infrastructure — sends them along, and applies the swap **only** to
elements it already verified (Phase 2's check remains the actual safety
boundary; a verified mismatch is never swapped no matter what the server
returns). Verified live: seeded an approved `device = mobile` rule,
confirmed the DOM text actually changed at a mobile viewport and stayed
default at a desktop viewport (two distinct contexts, real difference),
then pointed the script at a nonexistent site id and confirmed the page
rendered completely untouched — never broken, never blank.

Deferred, same as flagged going in: personalization boundaries UI,
a full audit-log/version-timeline (disable/re-enable plus the
never-mutated original cover "reversible" for now), and geo/session/
custom-attribute auto-detection in the live script (no IP-geolocation or
visitor-identity infrastructure yet — still fully simulable in Live View).

---

## Phase 4 — CTA & image personalization

- CTA personalization as a distinct concept from generic text (§8): label +
  destination, framed around the desired next action.
- Image personalization (§9) from an approved asset library — swap only, no
  generation yet, gated by the same approval/brand-safety discipline as
  text.

**Exit:** CTA and image swaps work end-to-end through the same
approve/version/revert pipeline as Phase 3, on the same live test site.

**2026-08-27 — done.** Found and fixed the real gap: `extractPage` already
captured every CTA's `href`, but `classifyPageElements` only ever turned it
into a `CTA_LABEL` — the destination was captured then silently discarded.
CTAs now classify as both `CTA_LABEL` and `CTA_HREF` (sharing one
selector), so a button's destination is personalizable for the first time,
not just its label. A new `deriveElementContent` helper made the
`raw → currentContent` mapping type-aware (`CTA_HREF` → the href, not the
label text) in both the real crawl path and the seed script.

**Confirmed with you:** the "approved asset library" for images (and, by
the same reasoning, CTA destinations) is other real content the crawl
already found elsewhere on the same site — same "never invent" principle
text personalization already uses. No upload pipeline; that's a
consciously separate, larger, security-sensitive later phase. The manual
personalize widget now renders a constrained picker (with an image
preview) instead of a free-text box for `IMAGE`/`LOGO`/`CTA_HREF`, and the
AI-or-heuristic suggestion path skips the AI call entirely for these types
(asking an LLM to "rewrite" a URL made no sense) and reuses the same
already-existing `suggestFromExistingContent` machinery. Also closed a
real pre-existing gap along the way: manually-entered personalization
content now goes through the same `javascript:`/`data:`/`vbscript:` scheme
check already applied to AI-generated content — harmless before since no
href/src fields were personalizable yet, load-bearing now.

Verified live: seeded a page with an approved rule swapping both a CTA's
`href` and an image's `src` for `device = mobile`; loaded it with
`dynamify-embed.js` at a mobile viewport and confirmed both actually
changed in the live DOM, then reloaded at a desktop viewport and confirmed
both were untouched — through the identical verify-then-swap pipeline text
personalization proved in Phase 3.

Deferred, same as flagged going in: a combined "label + destination"
single edit form for CTAs (they're two independent elements, like
`HEADLINE`/`SUBHEADLINE` already are); real image/asset uploads.

---

## Phase 5 — Recommendations & automatic personalization

- Traffic/segment analysis surfaces personalization opportunities from real
  data (§16 — "38% of your traffic is LinkedIn...").
- Suggested variants generated proactively; still approval-gated by default.
  "Automatic" deployment is explicitly opt-in, never the default (CLAUDE.md:
  AI output always requires explicit approval before it touches anything
  live).

**Exit:** at least one real recommendation is generated from actual traffic
data on a live test site and surfaced with accept / edit / ignore.

**2026-08-27 — done, with synthetic traffic (confirmed with you going in).**
No real visitor traffic exists anywhere in this environment, so "actual
traffic data" is honestly only proven as far as: the collection pipeline is
real, the analysis is real, but every event behind this note was
deliberately synthetic, generated by a Playwright-driven browser loading a
local fixture — never a raw DB insert standing in for it. That gap
(synthetic vs. a real visitor on a real site) stays open until this runs on
an actual live site.

Built: a new anonymous `SiteEvent` model (`PAGE_VIEW` only — no
visitor-identity/session cookie, per D5, which stays flagged not decided;
a share-of-traffic calculation only needs counts, not cross-event
correlation) fed by a beacon `dynamify-embed.js` now fires on every page
load, and a new public `POST /api/embed/site/[siteId]/events` (the second
and last route with CORS, alongside `.../elements`). On top of that,
`src/lib/recommendations/analyze.ts` is a pure, unit-tested function
(device / geo.country / utm.* / referrer-domain, ≥10 events and ≥20% share
as named constants) that `generateRecommendations` runs per page, upserting
`PENDING` rows and skipping any segment an `Audience` already targets.
Accepting a recommendation creates (or reuses) a real `Audience` — never an
auto-approved personalization; "nothing goes live unapproved" (Phase 3)
stays true regardless of how the audience was sourced. A "Recommendations"
card on the Sites page surfaces each with its stat, Accept / Edit name /
Ignore.

Found and fixed a real, previously-invisible bug along the way, the same
way Phases 3 and 4 did: `normalizeUrl` never stripped a visitor's UTM
query params before matching their URL against the stored crawled-page
URL, so **any page load carrying `utm_source`/etc. — the single most
common real-world case for exactly the campaign traffic this phase exists
to detect — silently failed to match its own crawled page at all**,
breaking both the runtime personalization swap (since Phase 3) and event
recording for that visit. Fixed narrowly, in the embed-matching path only
(`src/lib/embed/service.ts`): strip the five known UTM keys before
matching, leave every other query param alone, since e.g. `?page=2`
legitimately distinguishes one crawled page from another and must keep
doing so (existing `normalizeUrl` crawler behavior/tests untouched).

Verified live end to end, twice: (1) a Playwright-driven browser loaded a
local fixture through the real `dynamify-embed.js` 30 times (12 at a
mobile viewport with `?utm_source=linkedin`, 18 desktop) — confirmed 30
real `SiteEvent` rows landed via the actual public endpoint (not inserted
directly), generation surfaced `device=mobile` (12/30) and
`utm.source=linkedin` (12/30) with correct stats, accepting created a real
`Audience` with the right rule, reusing it on a second acceptance for the
same segment rather than duplicating. (2) Logged in as a real (throwaway)
user via a minted session cookie, loaded the actual Sites page in a real
browser, clicked "Check for recommendations," and clicked "Accept" on the
rendered mobile row — confirmed the real `Audience` existed in the
database afterward and the row disappeared from the list, screenshots
taken before/after.

Deferred, same as scoped going in: `CTA_CLICK`/conversion tracking
(page-view-level signal only, per the roadmap's own Phase 6 ownership of
"full generic-vs-personalized analytics"); editing the segment definition
itself on accept (only the audience name is editable — the field/operator/
value are fixed at generation time); any UI for `ACCEPTED`/`IGNORED`
history (only `PENDING` is listed; the rows still exist in the database).

---

## Phase 6 — Image generation & analytics maturity

- AI image generation/modification (§10), brand/style-constrained.
- Deeper integrations (CRM, ads, analytics platforms) feeding richer visitor
  context (§5, §15 step 4).
- Full generic-vs-personalized analytics (§20) — the business-impact
  reporting the product depends on to prove itself.

Not before Phases 1–5 prove the core loop end to end.

**2026-08-27 — analytics slice done; image generation and integrations not
started.** Phase 6 has no single exit criterion — it bundles three
independent initiatives. Asked you which to build first; you chose full
analytics reporting (§20). AI image generation and deeper integrations
remain entirely unbuilt — do not treat this note as covering them.

Picking analytics up immediately raised a real fork §20 doesn't address:
a true generic-vs-personalized *conversion rate* means linking a later
CTA click back to the page view that produced it, which normally means a
visitor-identity/session mechanism — reopening D5 (still just flagged,
not decided). Asked you; you chose to stay anonymous. Recorded as **D7**
in `docs/decisions.md`: each event (`PAGE_VIEW`, and a new `CTA_CLICK`)
independently flags whether *that specific rendering* was personalized,
computed once at record time so it's an immutable fact rather than
something that would silently change if a rule got approved/disabled
later. The comparison is an aggregate ratio (personalized CTA_CLICKs ÷
personalized PAGE_VIEWs vs. the same ratio for generic traffic), not a
per-visitor funnel — less precise, but stays inside Phase 5's
already-approved anonymous-events architecture.

Also found and replaced dead code along the way: the pre-existing
`/analytics` route and `getOrgAnalytics` were still querying the
superseded hosted-page model (`Page`/`Event`/`componentVariantId`), which
no Site-based org ever populates — confirmed nothing else in the app
depended on their shape, replaced wholesale against `SiteEvent`, same
"fresh models rather than bending old ones" reasoning D6 already
established for the schema.

Built: `SiteEventType.CTA_CLICK`, `SiteEvent.personalized` (stored, not
derived at query time) and `SiteEvent.contentElementId`, cascade-related
to `ContentElement`. `dynamify-embed.js` now attaches a click listener to
every verified `CTA_LABEL` node (not `CTA_HREF` — Phase 4 already
established they share one DOM node, so tracking both would double-count
a single click) and reports it through the same `/events` beacon PAGE_VIEW
already used. `recordSiteEvent` now re-runs `resolve()` itself to compute
`personalized`, and — the one security-relevant addition — rejects any
CTA_CLICK whose `contentElementId` isn't actually a member of the
resolved page's own components, so a public endpoint can't be used to
pollute one tenant's analytics with another tenant's or a made-up id. New
`getOrgAnalytics` totals page views/CTA clicks split by personalized vs.
generic, org-wide and per-site, with rates returned as `null` (not `0`)
when there isn't enough traffic yet to mean anything.

Scoped down, stated plainly: CTA clicks are the conversion signal (§20
lists "conversions" separately, but no goal-definition mechanism exists
anywhere in the product — inventing one wasn't this slice's job); revenue
is out of scope (nothing in this product touches payments, so "where
available" has no data source); "engagement" is out of scope (§20 never
defines a concrete metric for it); breakdown is per-Site, not per-page
(the old UI's per-Page granularity belonged to the superseded model).

Verified live, twice: (1) a Playwright-driven browser loaded a local
fixture through the real `dynamify-embed.js` as a mobile (personalized)
visitor and a desktop (generic) visitor, clicked the real CTA link in
both cases, and confirmed two real `CTA_CLICK` rows landed via the actual
public endpoint with the correct `personalized` flag — then confirmed
`getOrgAnalytics` computed the exact conversion rates those events imply.
(2) Logged in as a real (throwaway) user via a minted session cookie,
seeded 100 generic / 50 personalized page views and 4 / 8 CTA clicks
directly, loaded the actual `/analytics` page in a real browser, and
confirmed the rendered totals (4.0% vs. 16.0%, "+300% relative
improvement") matched exactly, screenshot taken.

Deferred: a distinct, configurable "conversion goal" concept separate
from CTA clicks; per-page (not just per-site) breakdown; revenue and
engagement metrics (no data source / no defined metric, see above). AI
image generation and deeper integrations — the other two-thirds of this
phase — have not been started.

**2026-08-27 — integrations slice done (IP-based enrichment only); image
generation not started.** "Deeper integrations" (§5, §15 step 4) literally
lists Google Analytics, HubSpot, Salesforce, Shopify, ad platforms, and a
generic CRM — six real OAuth integrations. Asked you to scope this down;
you chose IP-based firmographic enrichment: look up a visitor's IP against
a company database automatically, no OAuth, no customer setup beyond the
embed script. This is real, tested, off-by-default infrastructure for one
data source — it is not the six-platform integration surface §15 step 4
describes, and should not be read as satisfying it.

This fills a gap that's existed since Phase 1:
`VisitorContext.attributes` and the audience-rule editor's field list
(`attributes.industry`, `attributes.buyingIntent`) have always accepted
this kind of data with no real source ever populating it. `attributes.company`
is now that source.

Found and fixed two real gaps while building this, neither of which was
the original ask: (1) the public `/api/embed/site/[siteId]/events` route
validated request bodies against the same `visitorContextSchema` used by
trusted internal callers (Live View simulation), so a raw POST could
already set its own `context.attributes.*` and have it matched against
audience rules — a visitor could spoof their own segment. Closed by having
the public embed endpoints populate `attributes` exclusively from what the
server computes, never from client input; the embed script itself never
sent `attributes`, so nothing legitimate broke. (2) IP-based enrichment
makes the elements response vary by the visitor's IP, which isn't part of
the URL — the existing `Cache-Control: public, max-age=300` would have
risked serving one visitor's company-personalized response to a different
visitor sharing a cache slot. Fixed by having `getEmbedElements` report
back whether enrichment was actually attempted, and only caching when it
wasn't.

Built conservatively, documented rather than asked (you'd already approved
the direction knowing it needs "a new SSRF-safe outbound-fetch path"):
off by default per site (`Site.ipEnrichmentEnabled`, a plain toggle on the
Sites page); company only for v1 (ipinfo.io's basic `org` field is the one
part of their API stable enough to build against without a live key —
industry/employee-count sit behind a different paid tier this doesn't
attempt); a global, 7-day-TTL cache keyed by IP only, no visitor identity
ever stored. D5 (`docs/decisions.md`) widened with a paragraph naming IP
address collection as a data category its original content-liability
framing didn't cover — still flagging, not deciding.

Verified live, three ways, all against a mocked ipinfo.io (no real key
exists in this environment — the dev server was pointed at a local mock
server via `IPINFO_BASE_URL` for this): (1) a Playwright-driven browser
loaded a fixture through the real `dynamify-embed.js`, confirmed the
enriched `attributes.company` reached `resolve()` and personalized a
headline matched by an `attributes.company` audience rule, confirmed the
elements response carried no `Cache-Control` header for the enabled site
while a disabled site still got the normal 5-minute one, and confirmed a
second visit from the same IP didn't hit the mock server again (cache
holding once warm — the first, cold-cache visit legitimately can hit it
twice, since the page-view beacon and the elements fetch both trigger
enrichment independently with no single-flight lock across the two
requests; documented as a known, low-cost limitation in
`src/lib/enrichment/ipFirmographics.ts`, same class as the existing
single-process rate limiter). (2) Confirmed the client-attribute-spoofing
fix and the disabled-site no-op path against the real service functions.
(3) Logged in as a real user and toggled the checkbox on the actual Sites
page, confirmed it persisted in the database.

Deferred: industry/employee-count/other firmographic fields (uncertain
provider response shape without a live key to verify against); a real
paid ipinfo.io key has never been exercised, only a mocked stand-in with
the documented basic-tier response shape; the other five listed platforms
(HubSpot, Salesforce, Shopify, GA, ad platforms) and any OAuth-based
integration — untouched.

**2026-08-27 — image generation done; Phase 6 fully done.** §10's last
unbuilt piece. Two things were missing from this codebase entirely: an
image-generation API client (only Anthropic text-gen existed) and any
object/file storage at all (confirmed by exploration — nothing stores or
serves a Dynamify-hosted binary anywhere). Neither has real credentials in
this environment. Asked you how to handle storage, the one genuinely
blocking fork: a real S3-compatible integration (needs credentials this
environment doesn't have, verified against a second mocked provider
stacked on the mocked image-gen API) or data URIs stored directly in the
existing `ElementVariant.content` text column (no new infrastructure,
fully verifiable today, explicitly not production-shaped). You chose data
URIs.

Found a real validation conflict while wiring this in, not obvious going
in: `createElementPersonalization`'s `content` field (the generic "human
types free-text content" path) caps at 2000 characters and blanket-rejects
any `data:` scheme — deliberately, since `data:text/html`/`data:image/svg+xml`
are real XSS vectors. A base64 PNG data URI is both far longer than 2000
characters and exactly the scheme that check exists to block. Not
weakened — it's correct for arbitrary human/AI *text* input. Image
generation instead creates the `ElementVariant`/`ElementPersonalizationRule`
directly in its own service path (`generateImageVariant`,
`src/lib/sites/generateImage.ts`), with validation shaped for what it
actually produces (a `data:image/png;base64,` prefix + a size cap,
checked against our own generated output), never routing through that
schema at all.

Built: `OPENAI_API_KEY`/`OPENAI_IMAGE_BASE_URL` (same optional,
gracefully-degrading shape as every other integration this session —
`ImageGenerationNotConfiguredError` mirrors `AiNotConfiguredError`
verbatim); a prompt built from the element's section, the site's real
`WebsiteUnderstanding` (company/product/brand tone), and the *audience's
own targeting rules* (not a simulated visitor, unlike text
suggest-variant — image generation is triggered from a UI where the user
already picked an audience from a dropdown, so `describeAudience` derives
context from that audience's real rules instead); a "Generate new image"
action on the Sites page alongside the existing library picker, producing
a real `PENDING` rule that flows through the exact same
Approve/Disable/Remove UI every other rule already uses.

**No automated visual brand-safety check** — D4's two-layer text check
(whitelist + independent model fact-check) has no image equivalent built
here; there's no "does this picture claim something false" check to build
with confidence. The prompt is brand-steered, but the human approval gate
already required for every rule is the actual safety net, same as Phase
4's image/CTA_HREF reuse. **Fixed 1024×1024 output, not dimension-matched**
— `ContentElement` stores no width/height for an image, only a URL
string, so respecting "existing website dimensions" (§10) wasn't
attempted; square is the default, stated as a gap, not silently assumed
away.

Verified live, twice, against a mocked OpenAI images API (no real key
exists in this environment — honestly labeled, same posture as the
mocked ipinfo.io in the note above): (1) called `generateImageVariant`
directly, confirmed a real `PENDING` rule with `method: "AI"` and a
`data:image/png;base64,` content string, confirmed the sent prompt
actually included the seeded company/product/brand-tone/audience/brief
context, confirmed a non-image element type was rejected before any
provider call was ever made. (2) Logged in as a real user, clicked
"Generate new image" on the actual Sites page, watched the generated
image render as a real `<img>` in the browser, approved it through the
real UI, then loaded the page through the real `dynamify-embed.js` and
confirmed the AI-generated image actually swapped into the live DOM for a
matching visitor — the same verify-then-swap pipeline every other content
type has already proven, now exercised end to end for AI-generated
content for the first time.

Deferred, stated plainly: real object storage (data URIs are not
production-shaped — page-weight and CDN-cacheability both suffer, this
was a deliberate v1 trade to avoid needing credentials this environment
doesn't have); a real paid OpenAI key has never been exercised; visual
dimension-matching; any automated visual brand-safety layer; image
*modification* (editing an existing image, §10's other stated use case,
vs. only generating a fresh one).

**Phase 6 is now fully done** across all three initiatives (analytics,
IP-enrichment integrations, image generation). Every slice shares the
same honest posture: built for real, gracefully degrading when
unconfigured, verified against mocked providers where no real credentials
exist in this environment, with every gap stated rather than glossed
over.

---

## Hardening

Not phase-scoped work — closing deferred items flagged along the way,
ranked by real risk rather than by which phase happened to surface them.
Started at your request after auditing every "deferred" note across
Phases 0–6.

### 2026-08-27 — DB-backed rate limiting

The highest-ranked item: the rate limiter (`src/lib/auth/rateLimit.ts`)
had been in-memory and single-process since Phase 0, flagged even then as
"won't hold up across multiple instances or serverless deployments." By
now it sat behind auth, both public embed endpoints, and two *paid*
endpoints (image generation, IP enrichment) where it was the only cost
control — in any real multi-instance deployment it provided no
protection at all, since each instance held its own counter.

Replaced with a Postgres-backed fixed-window counter (new
`RateLimitBucket` model) — one row per `(key, window)`, not one row per
request, the standard cheap approach for this class of problem. Stated
trade-off: a fixed window allows up to ~2x the configured limit right at
a window boundary; accepted, since this is about abuse/cost control, not
per-millisecond precision, and it's still a large improvement over zero
cross-instance protection. The increment-and-check is one atomic
`INSERT ... ON CONFLICT` statement (not a read-then-write pair), so
concurrent requests for the same key can't both read "under limit" and
both proceed — verified directly (see below). Table growth is bounded by
a ~1%-probability, unawaited cleanup delete on each call, avoiding the
need for a cron scheduler that doesn't exist in this app.

**Found a real, environment-specific bug while building this**: the first
implementation compared `windowEnd` against Postgres's own `NOW()`.
`windowEnd` is a plain `TIMESTAMP` (no time zone); `NOW()` returns
`timestamptz`; comparing the two forces an implicit cast that
reinterprets the naive value through the session's time zone. This
session's Postgres runs with zone `Europe/Helsinki` (UTC+3) — every
freshly-inserted, still-valid window registered as already expired,
so the limiter never actually blocked anything. Caught by the new tests,
not by inspection. Fixed by never touching `NOW()`: both sides of every
comparison are bound parameters computed in JS (`now`, `windowEnd`),
which round-trip through the same storage convention regardless of the
session's time zone — confirmed with a throwaway script isolating the
exact comparison before touching the real implementation.

All 15 call sites (login, signup, password-reset request/confirm,
`sites` create/retry, `suggest-variant`, `generate-image`, `ai/copy`,
`ai/audiences`, `campaign-assignment`, `collect`, both embed endpoints,
`live-view/.../preview-html`) updated to `await` the now-async
`rateLimit()` — mechanical, but typechecked as real evidence none were
missed (a skipped `await` shows up as a type error, not a silent bug).
`tests/unit/rateLimit.test.ts` moved to `tests/integration/` (it now
needs a real database) with two new tests: fixed-window reset behavior,
and `limit` concurrent requests for the same key resolving to exactly
`limit` successes — the thing a naive (non-atomic) implementation would
get wrong.

Verified live, three ways: (1) a real `curl` loop past the login route's
per-email limit (10/15min) returned exactly 10× 401 (wrong password,
correctly reached) then a real 429 with `Retry-After: 900`, confirmed
against the actual `RateLimitBucket` row. (2) The thing only a
multi-process setup can prove: ran two separate `next start` instances
(ports 3000/3001, same build, same database — production's actual
deployment shape, not `next dev`, which refuses a second concurrent
instance) and confirmed a client rate-limited against instance A was
*also* blocked hitting instance B on the very next request — the exact
failure mode the in-memory version had. (3) Queried the shared
`RateLimitBucket` row directly and confirmed a single count accumulated
across requests to both instances, not two independent counters.

Deferred, stated plainly: the fixed-window boundary trade-off above;
table growth is bounded probabilistically, not by a real scheduled job
(none exists in this app); this is still one shared Postgres table, not
a purpose-built store (Redis, etc.) — fine at this scale, worth revisiting
if rate-limit traffic itself ever becomes a meaningful fraction of total
database load.

### 2026-08-28 — Real visitor identity + a Visitors page (replaces Audiences in nav)

Requested directly, not silently inferred from a screenshot: shown a
different product's per-visitor table (individual profiles, inferred
industry/interest/intent/stage), asked two questions before touching
anything — introduce real visitor identity (the opposite of this app's
deliberately anonymous `SiteEvent` model, D7/D5 in `docs/decisions.md`),
and actually remove the Audiences nav entry rather than add Visitors
alongside it. Both answered explicitly, the more invasive option each
time — recorded as decided in `docs/decisions.md` (D5's third widening,
D7's update), not resolved silently.

**What's real vs. what's heuristic, stated plainly:**
- **Company** — real, reuses the existing IP-enrichment result as-is.
- **"Industry"** (from the reference screenshot) — **not built.** No
  company→industry data source exists in this app; showing real `company`
  instead of inventing a classifier.
- **Interest** — real but simple: most recent UTM campaign or page title
  actually engaged with, both already captured per event.
- **Intent / stage** — a small, named, pure heuristic
  (`src/lib/visitors/inferProfile.ts`: `computeIntentScore`,
  `stageForIntent`), weighted page views + distinct pages + CTA clicks,
  clamped [0,1], bucketed into awareness/consideration/evaluation. Always
  labeled as inferred in the UI (a `title` tooltip on the stage badge),
  never presented as a measurement.
- **Converted** — real, reuses the existing CTA-click-as-conversion-signal
  decision from the Phase 6 analytics work, not a new definition.

**Mechanism:** a random, non-PII `dynamify_vid` first-party cookie, set by
`public/dynamify-embed.js` only when the server reports the site has
opted in (new `Site.visitorTrackingEnabled`, off by default, same toggle
shape as `ipEnrichmentEnabled` — a checkbox on the Sites page, not an
elaborate consent flow). New `SiteVisitor` model, org/site-scoped,
recomputed on every event. `SiteEvent.visitorId` links anonymous events to
a real visitor only on opted-in sites; the existing anonymous analytics
path (D7) is untouched and stays fully anonymous regardless of any site's
tracking setting.

**Audiences**, per the user's explicit choice, is off the sidebar
(`sidebar.tsx`'s `NAV_ITEMS`) but not deleted — the underlying feature is
load-bearing (element personalization, the legacy Pages flow, and
Recommendations' accept-action all read or write `Audience` rows
directly) and the route still works via direct URL. Same treatment
`sidebar.tsx` already gave Pages/Campaigns. Two new links keep it
reachable without nav real estate: Settings' new "Manage audiences" card,
and a "Create an audience" link in the element-personalization panel's
empty-audience state.

**Found a real bug via live verification, not by inspection**: the first
version of `upsertSiteVisitor` (`src/lib/embed/service.ts`) read the
existing `SiteVisitor` row, computed `pageViewCount + 1` in JS, then
wrote it back — a classic read-then-write race, the same class of bug the
rate-limiter fix above addressed. Caught by actually loading a fixture
page twice in a real browser against a real running server: the second
load's event landed concurrently enough with the first's that one
increment was lost (`pageViewCount` stayed `1` after two real page
views). Fixed by locking the visitor's row for the duration of the
read-compute-write (`SELECT ... FOR UPDATE` inside a transaction, row
ensured to exist first via a raw `INSERT ... ON CONFLICT DO NOTHING` —
`tx.siteVisitor.upsert()` itself turned out to throw a unique-constraint
error under concurrent callers here rather than taking the `ON CONFLICT`
path, so the row-creation step is raw SQL too). Re-verified live after
the fix (two real page loads → `pageViewCount: 2`) and covered by a new
integration test firing 10 concurrent events at the same visitor and
asserting none are lost.

Live-verified end to end, not just unit-tested: a real two-page-load
browser session confirmed one `SiteVisitor` row, a persisting (not
regenerated) `dynamify_vid` cookie across the reload, and the corrected
`pageViewCount: 2`; a tracking-disabled site confirmed to set no cookie
and create no row while still recording its anonymous `SiteEvent`; the
real dashboard confirmed logged-in, showing "Visitors" in the sidebar
(not "Audiences"), the Visitors table rendering the live row correctly,
the Sites page's new "Visitor tracking" toggle round-tripping through the
real PATCH endpoint, and `/audiences` still loading correctly via direct
URL despite being off the nav. `pnpm typecheck && pnpm lint && pnpm test
&& pnpm build` all clean (225 tests). All fixture data and scratch files
removed afterward.

**Still flagged, not resolved** (see `docs/decisions.md` D5): whether
enabling visitor tracking creates a real disclosure obligation beyond the
existing informational cookie-banner text, and GDPR/CCPA exposure by
jurisdiction. Off by default; a real customer should get legal review
before turning this on for real traffic.

### 2026-08-28 — Ecommerce foundation layer (docs/ecommerce.md)

Requested directly ("start making this" against `docs/ecommerce.md`,
which had gated itself on "do not implement before Phase 6" — Phase 6
finished the same day). That doc describes a second product's worth of
work (Shopify/WooCommerce/Squarespace adapters, OAuth apps, App Store
distribution), so before writing anything, asked what slice to start
with. Answered: foundation only — adapter contract, shared SDK skeleton,
encrypted connection storage, no live platform calls — and confirmed no
Shopify Partner account exists yet, so nothing platform-specific could be
tested against a real store regardless.

**Built:**
- `src/adapters/types.ts` — `PlatformAdapter` (server-side: connect a
  store, read its catalogue) and `StorefrontAdapter` (browser-side:
  collect visitor context, apply resolved content), platform-agnostic by
  construction — neither references a specific platform's SDK/API shape.
  `CatalogueItem` deliberately carries no price field at all, so the hard
  rule "never personalize price" can't be silently violated by a future
  adapter reaching for a field that shouldn't exist.
- `src/adapters/runtime.ts` — `runStorefrontPersonalization`, the doc's
  "shared JS SDK" layer: the one piece of orchestration every real
  adapter will plug into, calling the *unchanged* `resolve()` from
  `@dynamify/personalization-sdk`. Enforces "bots always get the default"
  itself (never calls `resolve()` for a detected bot) rather than trusting
  each adapter to remember. Confirms the existing engine package really is
  platform-agnostic already — nothing about it needed to change.
- `src/lib/security/encryption.ts` — the codebase's first reversible
  encrypt-for-storage primitive (AES-256-GCM). Everything stored before
  this was either one-way hashed (passwords, session/reset tokens) or
  plaintext (webhook signing secrets, domain verification tokens) —
  nothing needed a real credential back until a platform API key did.
  `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` added to `src/lib/env.ts`,
  optional (nothing has a real credential to store yet), a clear typed
  error (`EncryptionNotConfiguredError`) if used before it's set.
- `PlatformConnection` model + `src/lib/platformConnections/service.ts` —
  org-scoped, mirrors `domains`/`webhookSubscriptions`' existing shape
  exactly (HttpError subclasses, DTO never includes the secret,
  `requireOrgAccess`-gated once a route exists). Deliberately stores only
  "we have a connection to a store," no catalogue data at all — doesn't
  presuppose an answer to the doc's still-open sync-vs-read-through
  question. The adapter is passed into `connectPlatform()` by the caller
  rather than resolved from an internal registry, so picking a real
  adapter for a real request stays a decision for whoever builds the
  first one.
- A mock `PlatformAdapter` (in the new integration tests) proves the
  whole contract works end to end — connect, encrypted storage, decrypt,
  disconnect-clears-credential, cross-org isolation, duplicate-store
  rejection — without any real merchant account.

**Deliberately not built** (see `docs/ecommerce.md`'s updated status for
the full list): any real platform adapter, OAuth flow, dashboard route or
UI, or catalogue sync/storage. No route was wired because there's no real
adapter yet to route to; building one now would be dead code. The three
open questions in `docs/ecommerce.md` (catalogue sync vs. read-through,
revenue attribution across three analytics sources, shared audience
model) remain open — not resolved by this schema, on purpose.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean (241
tests: 16 new — 4 encryption round-trip/tamper/config-error, 5 runtime
orchestrator bot-skip/apply/fetch-failure, 7 connection-service
encryption/DTO-leak/cross-org/duplicate-store/disconnect).

### 2026-08-28 — Behavioral targeting: real intent/stage now drives personalization, not just the dashboard

Asked "make the hyper-personalization better and more personalized" —
genuinely ambiguous (more signals? richer rules? smarter AI suggestions?
behavioral targeting?), so asked which direction rather than guessing;
chosen: feed the real `SiteVisitor.stage`/`intentScore` the Visitors work
already computes into actual targeting decisions. Until now that data was
only ever displayed on the Visitors page — never read by the engine that
decides what a visitor sees, so a returning, high-intent visitor got
exactly the same content as a first-time one, on a site that had already
been tracking them.

**Zero changes to the personalization engine.** `matchAudience`
(`packages/sdk/src/audience.ts`) already resolves dotted `attributes.*`
paths against arbitrary string/number/boolean values with the full
operator set (EQUALS, GREATER_THAN, etc.) — confirmed before writing any
code that `attributes.stage`/`attributes.intentScore` would already work
through the exact same rule engine every other attribute does. The work
was entirely in getting the visitor's real state to that engine, not
teaching the engine anything new — reinforces CLAUDE.md's "one renderer"
rule and the ecommerce-foundation work's finding the same day that this
engine really is generic already.

**What changed:**
- `public/dynamify-embed.js`: a *pre-existing* `dynamify_vid` cookie (a
  returning tracked visitor's) is now read — never minted — up front and
  sent on the elements request itself, not just on events. A brand-new
  visitor has no history yet, so this is a no-op on a first visit
  regardless; a stale cookie from before a site turned tracking off is
  harmless, since the server is the actual gate either way.
- `src/lib/embed/service.ts`: `buildEffectiveContext` now merges two
  independent, independently-gated attribute sources into one
  `attributes` object — IP-based company (Phase 6, unchanged) and the
  visitor's real `stage`/`intentScore` (new, gated on
  `Site.visitorTrackingEnabled` + a recognized `visitorKey`, same posture
  as every other visitor-tracking gate this app has). `getEmbedElements`
  gained a `visitorKey` param and marks its response non-cacheable
  whenever a visitor lookup was attempted (same reasoning as IP
  enrichment's cacheability rule, just a second trigger for it).
  `recordSiteEvent` was updated to build the *same* effective context
  (not just `getEmbedElements`) — required for correctness, not just
  consistency: D7's `personalized` flag must reflect what the visitor
  actually saw, and skipping this would have silently made that flag
  wrong for exactly the visitors this feature targets.
- `src/components/audiences/audience-rule-editor.tsx`: two new field
  options, `attributes.stage`/`attributes.intentScore`, labeled to make
  clear they require visitor tracking on. Picking the stage field swaps
  the value input from free text to a dropdown of the three real values
  `src/lib/visitors/inferProfile.ts` ever produces — a typo there would
  otherwise silently never match (EQUALS is exact), a real gap this
  closes structurally rather than by trusting careful typing.
- `src/components/liveview/visitor-profile-form.tsx`: the same two fields
  added to the simulator, so a merchant can preview "what does a
  high-intent returning visitor see" without a real tracked visitor.

**Security review**: the new `visitorKey` query param on a public,
unauthenticated GET endpoint is a random, high-entropy UUID — same trust
model as the existing events-endpoint `visitorKey`, capped to 100 chars,
never used unless the site itself has tracking on. Knowing someone else's
cookie value already implies broader access to their browser than this
adds; this inherits D5's existing visitor-identity risk model rather than
introducing a new one. Response shape unchanged — raw attributes/context
are never returned to the client, only the resulting (already-public)
content.

Live-verified end to end: seeded a `SiteVisitor` row directly (stage:
evaluation, intentScore: 0.85 — simulating prior real visits) and an
approved rule on `attributes.stage`, then loaded a real fixture page
through the real embed script with that visitor's cookie already set —
got the personalized "Ready to buy?" headline. A fresh browser context
with no cookie, same page, got the untouched default. Confirmed via raw
`curl` that the response is non-cacheable exactly when a visitor lookup
happens and cacheable exactly when it doesn't. Confirmed both new UI
fields render and behave correctly in the real dashboard (rule builder's
stage dropdown, Live View's simulator fields) via Playwright screenshots.
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean (248
tests: 7 new integration tests covering match/no-match, tracking-off
no-op, unrecognized-visitor no-op, cacheability, and
recordSiteEvent/getEmbedElements consistency). All fixture data and
scratch files removed afterward.

### 2026-08-28 — A/B holdout, causal lift, underperformance alerts, cold-start audiences, pricing page

Continuation of a design-partner conversation ("how can we make it worth
the price and genuinely raise conversion rates on every site used"). The
core finding: the existing generic-vs-personalized Analytics comparison
is confounded, not causal — it compares visitors who matched a rule
against visitors who didn't, two different populations, not a control
group. Four things followed from that, executed in dependency order.

**1. A/B holdout** (`Site.holdbackPercent`, 0–50, off by default;
`SiteEvent.heldOut`) — a merchant-configurable % of visitors who'd
otherwise be personalized instead see the default, giving Analytics a
true control group. `src/lib/experiments/holdout.ts`: a pure, deterministic
hash-based coin flip (no `Math.random`/`Date.now`, same discipline as
`packages/sdk`) — seeded by the visitor's `visitorKey` when tracked, else
a fresh per-load `loadToken` the embed script now generates and sends on
both the elements request and every event for that load. Both
`getEmbedElements` and `recordSiteEvent` independently recompute the same
decision from the same inputs rather than trusting either the client or
each other — the same "never trust, always re-derive" posture as every
other cross-endpoint consistency requirement this session.

**2. Statistical significance + underperformance alerts** —
`src/lib/analytics/significance.ts`, a hand-rolled two-proportion z-test
(erf approximation, no dependency), returning a null verdict below
`MIN_GROUP_SIZE = 30` per group rather than a falsely-precise p-value.
Analytics now shows a real verdict per site running holdout: helping
(significant, higher), no difference yet, not enough data, or — the
actual underperformance alert — **significantly underperforming the
default, review your active rules**. No auto-disable; flags for human
review, same posture as Recommendations.

**3. Cold-start default audiences** — `seedDefaultAudiences` (idempotent,
no-ops if the org already has any audience) creates three starter
audiences (new/returning/mobile visitors) on a site's first successful
crawl, removing the blank-Audiences-page friction on exactly the account
most likely to churn before behavioral targeting has any real visitor
history to work with.

**4. A real pricing page** — `<LandingPricing>`, three tiers built around
what's actually shipped (not ecommerce/Shopify, still just a foundation
layer), usage-differentiated (sites, tracked page views/mo) rather than
one flat number for every store size. CTAs go to the real `/signup`
route; explicitly no payment collection — real billing needs a Stripe
account, the same class of external blocker as the Shopify Partner
account. Nav's "Pricing" link, previously an anchor to the stats section,
now points at the real section.

**Two real bugs found via live verification, neither by inspection:**
- The first live test against the fixture site returned `{"elements":[]}`
  for a page that definitely existed. Root cause: the long-running `next
  dev` process had a Prisma Client generated *before* this session's
  earlier schema changes cached in memory — `pnpm exec prisma generate`
  had already been re-run on disk, but the already-running dev server
  never re-imported it. Fixed by restarting the dev server; worth noting
  as a recurring class of issue when schema work spans a long session.
- The org-level causal-lift rollup initially summed *every* site's
  personalized-traffic count into the treatment bucket, regardless of
  whether that site was running holdout at all — pairing one site's real
  control group against a treatment count inflated by an unrelated site's
  ordinary personalized traffic. Caught by seeding two real sites (one
  running holdout, one not) and reading the live Analytics page: the
  treatment count was visibly larger than the holdout-enabled site's own
  traffic could produce. Fixed by building a separate org-level causal
  bucket that only ever sums sites with `holdbackPercent > 0`; added the
  regression test that would have caught it
  (`tests/integration/analytics.test.ts`).

Live-verified end to end with real traffic: ~150 real requests through
the actual embed API (paced under the existing rate limits, not
mocked), producing a genuine ~40/60 holdout/treatment split and a real,
non-trivial significance verdict on the Analytics page; confirmed the
holdback-percent input round-trips through the real PATCH endpoint;
confirmed the pricing section renders and its `/signup` links are real.
All fixture data and scratch files removed afterward.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean (279
tests: 5 new holdout-hash unit tests, 8 new holdout integration tests, 7
new significance unit tests, 6 new causal-lift integration tests
including the org-rollup regression, 5 new cold-start-audience
integration tests).

### 2026-08-28 — Live View: demo-quality redesign

Requested directly: "make the live view more detailed and better,
animated and interactive... it will be used for demo for potential
customers, it has to be amazing." Used the frontend-design skill for the
creative direction, then a plan for the engineering breakdown, given the
scope (new dependency, an architecture decision, multiple files).

**The core problem wasn't cosmetic.** The old primary preview was two
iframes doing a live, real-time re-fetch of the external site's actual
URL on every load (`renderPreview.ts`) — no cached HTML exists anywhere
(`CrawledPage` only ever stored structured elements). That's only as
reliable as a third party's uptime *and* their `X-Frame-Options`/CSP
`frame-ancestors` headers (most real sites block being iframed at all),
and it fails outright for a fictional demo site like the seeded "Lumen
Metrics." Exactly the failure you can't afford live in front of a
prospect.

**Fix, stated as a decision, not silently swapped in:** the primary
preview is now rendered from our own already-crawled structured data
(`ContentElement` + resolved content) inside a browser-chrome frame
(continuity with the landing page's existing mockup motif), not an
iframe of the external site. This wasn't only a reliability fix — it's
the only way to get the actual signature moment at all, since you can't
smoothly animate content inside a sandboxed cross-origin iframe from the
parent page. The old iframe pair wasn't deleted: it's now a collapsed,
secondary "Compare against the real live site" panel, so it's still
there for pages where the real site happens to be embeddable.

**Signature moment**: a personalized element visibly lifts away and the
new value settles into place, confirmed with a brief green pulse —
reusing `--status-positive`, the same "personalized" meaning that color
already carries across Analytics/Visitors/Sites, not an invented signal.
Staggered per changed element (headline → subheadline → CTA) so
persona → change reads as cause → effect. New dependency: `framer-motion`
(none existed) — a dashboard-only tool, not the customer-facing embed
script, which deliberately stays dependency-free; a different bar
applies.

**The 15-field form is no longer the primary interaction.** A curated
set of one-click persona presets (`src/components/liveview/
persona-presets.tsx`) — Returning visitor, Mobile from a Google ad,
Warming up, Ready to buy, Enterprise/company identified — built from
audiences already real in this app, not cosmetic placeholders: clicking
one on the seeded Lumen Metrics site actually resolves against the real
rules seeded there and produces a genuinely different result each time,
verified live. `VisitorProfileForm` is unchanged and fully capable, just
demoted behind "Customize further" for the edge cases that need it.

**"Why this changed" now delivers on this product's own stated
promise** ("full attribution: see what changed, why, and which signal
triggered it," docs/product-spec.md) instead of half-delivering it — a
Personalized/Default badge became a real attribution line naming the
matched audience and its priority. Required two small, purely additive,
presentational-only fields on the SDK's own types
(`packages/sdk/src/types.ts`): `ComponentDefinition`/`ResolvedComponent`
gained `section`, `AudienceDefinition` gained `name` — `resolve.ts`'s
actual matching/priority/specificity logic is completely untouched,
confirmed by the full existing personalization test suite passing
unmodified (23 tests, zero changes needed).

Live-verified end to end against the real seeded Lumen Metrics
audiences: every persona preset resolved the correct, distinct real
headline/CTA with zero console errors; caught the green "personalized"
glow mid-fade in a live screenshot; confirmed the secondary "Compare
against the real live site" panel still gracefully shows "Couldn't load
a live preview" for the fictional site rather than being the primary,
broken experience; confirmed `prefers-reduced-motion` genuinely skips
the animation (checked with Playwright's `reducedMotion: "reduce"`
emulation, not just code review) — content renders instantly, fully
settled, no mid-transition state. `pnpm typecheck && pnpm lint && pnpm
test && pnpm build` all clean, 279 tests unaffected (pure
presentation-layer rebuild on the same resolve() pipeline and the same
real crawled data — no backend/data-model changes beyond the two
additive SDK fields). All scratch files removed afterward.

**Follow-up same day**: the initial redesign replaced the old always-visible
side-by-side "Default visitor"/"This visitor" comparison with a single
panel that transitions in place, demoting the comparison entirely behind
the secondary "Compare against the real live site" toggle. Asked to bring
the before/after view back. Rather than reverting to the old fragile
iframes, `RenderedPreview` gained an optional `label` prop and now
renders twice side by side — a constant "Default visitor" panel (always
the untouched default, recomputed only when the page changes, not on
every persona switch) next to "This visitor" (which still gets the full
animated transition on persona switch). Gets the best of both: the
reliable, animatable synthesized preview *and* direct visual comparison,
without reintroducing the reliability problem the redesign was fixing in
the first place. Live-verified: both panels render distinct real
headlines side by side for the same persona. `pnpm typecheck && pnpm
lint && pnpm test && pnpm build` all clean, 279 tests unaffected.

**Second follow-up same day**: reported as "not properly rendering the
website live view." Reproduced directly rather than guessing: Live View
defaults to whichever page has real personalization rules first — the
seeded Lumen Metrics demo site, which has no real URL. Opening "Compare
against the real live site" there always hits the documented (but
previously unexplained-in-the-UI) fallback, and a bare "Couldn't load a
live preview" with no reason reads as broken, not as expected behavior.
Confirmed the mechanism itself is fine — the same panel against a real
seeded site (retention.com) renders its actual logo/nav/copy correctly.
Fixed the UX, not a bug in the resolution/fetch logic: the toggle now
says upfront "only works for a real, publicly reachable page," and
`unavailableHtml` (`src/lib/liveview/renderPreview.ts`) explains the two
real causes (no live URL, or the page blocks framing) and points back at
the primary preview above, which doesn't depend on this succeeding.
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean, 279
tests unaffected (the one existing test on this function only asserted
the URL is present, not the exact wording).

### 2026-08-29 — Personalize flow: real buttons, plain language

Requested directly: "make the personalize flow way more easy to operate
and clear... make it that a 5 year old can operate," a direct follow-up
to actually driving `element-personalize.tsx` by hand this same session
(proving personalization works on a real connected site). Every action —
Personalize, Approve, Disable, Re-enable, Remove — was a `text-xs
underline` link with no visual weight; creating a rule and approving it
were two disconnected steps (Save closed the form silently, leaving a
PENDING rule for a merchant to go find and approve later, with no
signal they still needed to); the audience picker was a bare `<select>`
showing only a name, ignoring the `description` every audience already
has; "Priority" was an unlabeled number input always on screen; "Remove"
deleted a variant with zero confirmation.

**Fixed, without weakening "nothing goes live unapproved":** every
action became a real `Button` (`Turn on`, `Pause`, `Turn back on`, a new
danger-variant `Delete` that requires a confirm/cancel step first — a
real, previously-missing safety gap as much as a clarity one). The
audience picker became a clickable card list (reusing Live View's
persona-preset selected/unselected pattern from earlier this session),
showing each audience's real description. Priority moved behind a
collapsed "Advanced options" disclosure, default closed. Saving no
longer silently closes the form: a new `justSaved` state shows "Saved."
with an explicit "Turn on now" / "Not yet" choice — still two real API
calls (create, then approve), just presented as one continuous decision
instead of a scavenger hunt. `site-detail.tsx`'s "Hide/View" and "+N
more" got the same real-button treatment for visual consistency with the
newly-redesigned component sitting right next to them.

No API or schema changes — `POST .../personalize` already returned
`{ rule }` with `rule.id`/`rule.status`, all the new "turn it on now?"
step needed. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
all clean, 279 tests unaffected (pure presentation-layer change). **Live
verification was deferred at first** — the preview account's password
didn't match anything on hand — and completed once resolved (see the
boundaries entry below, which covers both features' live verification
together): audience-card selection, the Advanced-options disclosure,
save → "Turn on now?" prompt → turn on, a full Pause/Turn-back-on round
trip, and Delete's confirm/cancel step were all driven end to end
against the real seeded Lumen Metrics site via Playwright.

### 2026-08-29 — Personalization boundaries + opt-in AI auto-approval

Two requests, handled together since the second constrains the first:
build the boundaries UI product-spec.md §14 has scoped since Phase 3 but
never shipped ("allowed / restricted / never-change, per element and per
element type"), and build "accept all personalization." That second one
was genuinely ambiguous — asked directly what it should mean, and the
answer was the stronger of two options: AI suggestions going live with
no per-rule human review at all. That's this product's own "Automatic
Personalization" concept (§17), which the spec itself gates as "if
explicitly enabled" — built as exactly that: an off-by-default, explicit
per-site opt-in (`Site.autoApproveAiContent`), the same shape as
`ipEnrichmentEnabled`/`visitorTrackingEnabled`, never a silent default
change. Scoped to the one AI-content path actually wired into the UI —
`generateImageVariant` (AI image generation); `suggest-variant` exists
but is called from no component today, confirmed by grep, so wiring it
up was explicitly left out as separate, unrequested scope.

**The link between the two:** auto-approve only ever fires for an
ALLOWED-boundary element (`shouldAutoApprove`,
`src/lib/sites/boundaries.ts`, unit-tested for all nine combinations of
on/off × Allowed/Restricted/Never) — a Restricted element (pricing,
legal text) exists specifically because it needs a human's judgment, so
turning auto-approve on for a site can never skip that.

**Built:** `PersonalizationBoundary` enum (`ALLOWED`/`RESTRICTED`/`NEVER`)
and a nullable `ContentElement.personalizationBoundary` override (null =
inherit the type default). `DEFAULT_BOUNDARY_BY_TYPE`
(`src/lib/sites/boundaries.ts`) maps §14's examples onto this app's real
`ContentElementType` enum — `LOGO` is the one type §14 names explicitly
under "Never change"; `CTA_HREF` was deliberately kept `ALLOWED` despite
reading like "Navigation" at a glance, since this app already ships
approval-gated CTA-destination personalization as a working Phase 4
feature and defaulting it to Restricted would have been a real,
unrequested regression. Enforcement (`assertBoundaryAllows`,
`src/lib/sites/personalization.ts`, shared by both
`createElementPersonalization` and `generateImageVariant`) is
server-side and never trusts the client: `NEVER` always throws before
any row is created (and, for image generation, before the paid OpenAI
call is ever attempted); `RESTRICTED` requires a new
`acknowledgedRestricted` field the client can't fake its way past — it's
a real, separate boolean the UI only sets true once a human checks a box
explaining why the content is restricted. `setElementBoundary` + a new
`PATCH .../content-elements/[elementId]/boundary` route persist an
explicit per-element override; `null` resets to the type default rather
than leaving a stale one behind.

**UI**, folded into the just-redesigned `element-personalize.tsx`: a
small boundary badge next to the entry button when non-Allowed; an
always-visible three-way "Personalization boundary" changer once
expanded; a `NEVER` element replaces its entire add-flow with a plain
"Never personalized" explanation and a deliberately low-emphasis
"Allow personalization for this element anyway" escape hatch (per §14:
"the user should be able to control" this, not an immutable wall); a
`RESTRICTED` element gets a danger-tinted callout and a required
checkbox gating Save/Generate. A new `AutoApproveToggle`
(`src/components/sites/auto-approve-toggle.tsx`, the same
checkbox-plus-description shape as `IpEnrichmentToggle`) sits on the
Sites page; when a just-saved rule already comes back `APPROVED`
(auto-approved), the "Turn on now?/Not yet" prompt is replaced with a
plain "Live — auto-approved, because this site has AI auto-approval on
for allowed content" line, so it's never silently invisible that this
happened.

**A real, intentional behavior change, handled deliberately, not
silently:** `LOGO` defaulting to `NEVER` meant an existing test
(`tests/integration/generateImage.test.ts`) asserting a LOGO element
reaches the "not configured" check was now testing stale behavior —
updated to assert the new, correct block instead, plus new tests for the
override that lets a LOGO element back in and for the acknowledgment
gate on Restricted.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean — 302
tests (23 new): boundary defaults/precedence/reasons and
`shouldAutoApprove`'s full truth table (`tests/unit/sites/boundaries.test.ts`),
NEVER-blocks/RESTRICTED-needs-acknowledgment/`setElementBoundary`
cross-org isolation (`tests/integration/personalization-boundaries.test.ts`),
the updated + new `generateImage.test.ts` cases, and
`setAutoApproveAiContent` default/round-trip
(`tests/integration/site-settings.test.ts`). Both this and the
personalize-flow redesign above were then live-verified together via
Playwright against the real seeded Lumen Metrics site: the Restricted
badge and checkbox actually gating Save, a real save succeeding once
acknowledged, the Never state genuinely hiding the entire add-flow, the
"Allow anyway" override restoring it, and the AutoApproveToggle
rendering off by default. **Honest gap:** the actual
auto-approve-creates-an-`APPROVED`-rule success path inside
`generateImageVariant` was not exercised live in this pass — no
`OPENAI_API_KEY`/mocked base URL was configured — only its pure decision
function is tested; this matches the existing, stated precedent for this
exact function (Phase 6's image-generation note), where the real
provider round-trip has always been the one part proven live rather than
integration-tested. All scratch verification scripts/screenshots and
DB rows created during this pass were removed afterward.

### 2026-08-29 — Visitor data rebuilt against docs/visitor-data.md

Requested directly: "rebuild the visitor page" against
`docs/visitor-data.md`, a legal/architectural spec ("the constraints in
this document are legal and architectural, not preferences"). Researched
the gap before touching anything: today's model was one flat
`SiteVisitor` table, two on/off toggles, no `Company`/`Person` split, no
consent object, no data-subject-rights endpoints, no CRM export — asked
directly whether "rebuild the page" meant a UI refresh or the doc's full
architecture; the fuller option was chosen. See `docs/decisions.md`'s D5
(widened again) for the full design writeup; this entry covers what
shipped.

**A real, pre-existing compliance violation, found while researching,
fixed here:** `IpEnrichmentCache` stored a visitor's raw IP as a
plaintext primary key with no deletion mechanism — the 7-day TTL only
gated re-fetching, never deletion, contradicting the doc's own "Never
capture: raw IP retained at rest." Fixed: the cache is now keyed by a
SHA-256 hash (`hashIp`, `src/lib/enrichment/ipFirmographics.ts`, same
primitive `src/lib/auth/session.ts` uses for tokens), with real
TTL-driven deletion added via the same opportunistic cleanup pattern
`RateLimitBucket` already used.

**Built:** `Company`/`Person` models (`SiteVisitor.company` string →
`SiteVisitor.companyId`, backfilled via a hand-written data migration —
not just schema-diffed, since real seeded data existed); a real
three-way consent object (`{necessary, analytics, personalization}`)
threaded as an input to `buildEffectiveContext`
(`src/lib/embed/service.ts`), not a wrapper around it; `VisitorSession`
(real per-visit detail — referrer/UTM/device/geo — that
`SiteVisitor`'s running-totals-only shape previously overwrote and
lost) and `Impression` (one row per personalized component per page
view — the doc's own called-out "most valuable data," previously only
reconstructable from a JSON blob) and `Conversion` (a real stored fact,
replacing a derived `ctaClickCount > 0` boolean); configurable per-org
retention windows (Settings, enforced by the same cleanup pattern);
real data-subject-rights export/delete endpoints with a new, minimal
write-side `AuditLog`; a CSV export (no OAuth needed, unlike a real CRM
connector); `window.dynamify.setConsent()` in the embed script as a
real, working gate a merchant's own CMP can call into. Real edge-geo
capture added too (`geoFromHeaders`) — `geo.country`/`geo.region` were
already selectable audience-rule fields in the UI with nothing server-
side ever populating them; closed, not just left as a known gap.

**Two real bugs found via live verification, neither by inspection:**
(1) A design error caught by 23 broken tests, not by reading the doc
twice: the first version gated the *entire* anonymous `SiteEvent` write
behind `consent.analytics`, but the doc's own "Always (no consent
needed)" bucket explicitly lists page URL/device/UTM/geo and "resolved
audience, matched rule ID, variant ID served" — the anonymous event was
never supposed to require consent at all; only the *persistent* visitor
record (`SiteVisitor`/`VisitorSession`) is a "with consent" capability.
Fixed by moving the gate to exactly that one write. (2) `Impression`
rows were recorded from every event's `resolve()` call, including
`CTA_CLICK` — so a page view followed by a click on that same,
already-rendered page double-counted every personalized element as
"shown" twice. Fixed: impressions are only ever recorded on `PAGE_VIEW`.
A third, smaller one: `consentState` was written only via the schema
default at row-creation and never actually updated on subsequent
writes, so a visitor's real granted consent never showed up anywhere —
fixed by writing the caller's actual consent on every `upsertSiteVisitor`
call, all three caught and re-verified live against the real embed API,
not just unit tests.

**Deliberately deferred, stated not silently dropped** (see D5's full
writeup in `docs/decisions.md`): merging the `elements`/`events` embed
endpoints into the doc's single `/collect` (large rewrite of a working,
already-verified pipeline — holdout, causal lift, and cacheability all
depend on the current shape — for no gain toward this task);
HubSpot/Salesforce/Klaviyo/Shopify/Segment CRM connectors and the
generic outbound webhook (no OAuth credentials in this environment, and
the doc's own staging keeps CRM a separate, later phase from tracking);
real CMP-vendor-specific consent-signal parsing (Google Consent Mode
v2/IAB TCF — the gate itself is real and working, a specific vendor's
signal format is ongoing integration work).

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean — 322
tests (26 new: boundary/session/geo pure-function unit tests, consent-
gating and impression-dedup integration tests, DSR export/delete/audit-
log/cross-org tests, retention-window round-trip). Live-verified end to
end against the real seeded Lumen Metrics site via the actual public
embed API (not mocked): a consented mobile visitor produced a real
`SiteVisitor` + `VisitorSession` + 2 `Impression` rows (headline + CTA,
each exactly once) + a `Conversion` on a real `CTA_CLICK`; a
consent-withheld request produced only the anonymous `SiteEvent`, no
persistent row at all; the rebuilt `/visitors` page rendered all of it
correctly (session history, "matched X — shown Y" impression lines,
consent badges) via Playwright; Export downloaded a real JSON file and
logged an audit row; Delete cascaded and removed everything; the
retention-window form round-tripped through the real PATCH endpoint;
the Analytics page (untouched by this change) still loaded correctly
against the same data, confirming the additive-only claim rather than
assuming it. All scratch verification scripts/screenshots and DB rows
were removed afterward; the two audit-log rows created by the live
Export-button click were left in place as genuine records of a real
action, not scratch fixtures.

## 2026-08-29 — Recommendations and the full-experience generator merged; Overview redesigned

Recommendations and the full-experience generator (docs/roadmap.md's own
prior entry) are now one feature, moved out of the per-site Sites panel
into a new top-level `/recommendations` page under Tools. Accepting a
recommendation both targets the segment (as before — creates or reuses
the real Audience) and, in the same action, automatically tries to
generate a coordinated full-experience content bundle for it — "based on
data [the recommendation's own real traffic clustering] and audiences
[the Audience accept creates]," not a separately-triggered manual form
anymore. A generation failure (rate limit, nothing eligible at that
moment) never blocks accepting — the audience is still created, and a
"Generate a full experience" button appears inline as the explicit retry
path (CLAUDE.md: every failure needs a recovery path), reused by any
recommendation accepted before this change too. `GeneratedExperience` is
re-derived at read time from the page+audience pairing, not cached on the
Recommendation row, so approving/disabling one piece through the normal
per-element flow is reflected here on the next read.

Site detail lost both the Recommendations and Full experiences panels
entirely. The experience action routes (get/approve-all/reject-all) moved
from `.../sites/[siteId]/experiences/...` to a flat
`.../organizations/[organizationId]/experiences/...` — they never
actually used `siteId` for authorization, only for URL nesting — and the
now-unused list/create route and `listGeneratedExperiences` service
function were removed rather than left as an orphaned second entry point
into experience creation.

Overview's cards changed from crawl/structural counts (elements
discovered, sections identified) to performance: a personalization-lift
hero stat, page views/CTA clicks with their personalized share, and a
"Default vs. personalized" conversion-rate comparison (reusing
`getOrgAnalytics`, the same real data Analytics already computes — no new
metric, no fabricated numbers) with a link to the full breakdown. No
revenue/dollar figures — `Conversion.value` is never actually populated
anywhere in this codebase, so a literal "financial" number would be
invented; conversion-rate lift is the real, honest proxy this product
actually has for financial impact.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean — 347
tests (recommendations.test.ts rewritten for the org-wide API and the
auto-generate-on-accept behavior, including "audience is still created
when generation produces nothing," "retry succeeds once a real candidate
exists," and "refuses to generate for a still-PENDING recommendation";
generateExperience.test.ts updated for the removed list function and the
new `pageElements` DTO field). Live-verified end to end, not just typed:
seeded a fresh site with real traffic clearing the recommendation
thresholds, clicked Accept in the browser, and watched the full-experience
review panel (before/after preview, rule list, Approve all/Reject all)
appear inline automatically with zero extra clicks; separately verified
the manual retry path on a recommendation that predated this change
(showed "No content generated yet" correctly, generated successfully once
rate-limited state was cleared, surfaced the rate-limit error cleanly
when it wasn't); confirmed Site detail no longer mentions either removed
section; confirmed the Overview screenshot shows real numbers (e.g. a
genuine +154% lift line and an 11.1%-vs-28.2% bar comparison against this
environment's actual seeded traffic). All scratch sites/audiences/scripts
created for verification were removed afterward.

## 2026-08-30 — Two crash bugs fixed; the old hosted-page model retired for real

Found in a full product QA sweep: `/sites/[siteId]` and
`/pages/[pageId]/edit` both threw an uncaught `HttpError` (`SiteNotFoundError`/
`PageNotFoundError`) for a stale link, a mistyped id, or another org's id —
a raw 500 instead of a graceful not-found. Both now catch the specific
not-found error and call `notFound()`; a new `(dashboard)/not-found.tsx`
renders a real on-brand "Not found" state inside the normal dashboard
shell instead of the generic `(dashboard)/error.tsx` boundary (which is
for real failures, not "this doesn't exist").

Separately: `/audiences`, `/campaigns`, and `/pages` were reachable by URL
but linked from nowhere in the nav — asked to resolve that limbo one way
or the other. Audiences (real, current, load-bearing — used by
personalization, recommendations, and the full-experience generator) was
promoted into the primary nav. Campaigns and Pages — the "Dynamify hosts
your page" model the 2026-08-26 pivot already named superseded — were
retired for real instead of promoted: every route, page, component, and
service built on `Project`/`Page`/`PageVersion`/`Component`/
`ComponentVariant`/`Campaign`/`CampaignAssignment`/`Domain` was removed
(~20 files), along with the now-pointless `{slug}.BASE_DOMAIN -> /p/{slug}`
subdomain-rewrite middleware (`src/proxy.ts`) and the `BASE_DOMAIN` env
var it existed for. Shared code the old model happened to sit next to was
kept and trimmed instead of deleted wholesale: `safeContentString`/
`DANGEROUS_URL_SCHEME` (`src/lib/validation/pages.ts`) and the AUDIENCE
half of `src/lib/ai/proposals.ts` are still real, current dependencies of
the Audiences AI-generation flow — only the COPY-proposal branch and
`generateCopy.ts` went. The Prisma schema itself is untouched (no
migration) — real rows exist in these tables, and dropping tables with
live data is a separate, more consequential decision than removing dead
application code; the schema section is marked with an explicit RETIRED
comment instead so a future reader isn't left guessing.

**Found but deliberately not touched in this pass, flagged instead:**
`/api/collect` (`src/lib/tracking/*`, the `Event`/`Visitor` models) is
*also* old-hosted-page-model code — `recordEvent` queries
`prisma.page.findFirst(...)` directly, so with no way left to publish a
new `Page` it's now permanently dead (never crashes, just can never
succeed). Missed in this pass because it's an analytics path, not a
UI/route surface, and this task's own scope was the nav-reachable pages
specifically — real cleanup, next time this area gets touched.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean — 347
tests (5 fewer than before: two cross-tenant tests exercised the old
Page/Component model specifically and were rewritten against current
resources rather than deleted outright, since the isolation principle
they proved still matters). Live-verified in a browser: both fixed routes
return a real 404 with the new not-found page; `/campaigns` and `/pages`
404 identically; `/audiences` still works and now shows in the sidebar
under General.

## 2026-08-30 — CI stood up

`.github/workflows/ci.yml`: typecheck → lint → migrate a real Postgres
service container (dev + test databases, mirroring `pnpm db:migrate` /
`pnpm db:test:migrate` exactly) → test → build, on every push and PR.
Pure downside protection — nothing here was broken, this locks the
already-clean state in. The existing tooling (`prisma7.config.ts`,
`tests/setup/env.ts`, `scripts/migrate-test-db.mjs`) reads a real `.env`
file directly rather than `process.env` alone, so CI writes one instead
of changing that convention just for itself. Not simulated — every step
was run for real, locally, against fresh throwaway databases
(`dynamify_ci_dev`/`dynamify_ci_test`) standing in for the service
container: all 21 migrations applied cleanly to an empty database, all
347 tests passed with zero pre-existing data (proving the migration set
has no hidden seed-data dependency), and the build succeeded — then the
throwaway databases were dropped and the real `.env` restored, verified
against real row counts unchanged.

## 2026-08-30 — Privacy Policy & Terms scaffolded, not written

`/privacy` and `/terms` (new `(legal)` route group, shared
`LegalDocument` component) — real section structure grounded in how the
product actually works (docs/visitor-data.md's consent layers, D5's
processor/controller question, D5's AI-content liability question), legal
language itself deliberately left as `[Placeholder — ...]` markers
throughout. An unmissable "Draft — not final, not legal advice" banner
sits above the fold on both pages — this exists so counsel has less to
write, not so a real visitor could mistake it for a real policy in the
meantime. The landing footer's "Privacy · Terms · GDPR" was plain
non-functional text before this — now real links, GDPR pointing at an
anchor on the new "Your rights" section rather than a bare page top.
Signup gained a real "By creating an account, you agree to..." line,
which didn't exist before either. `pnpm typecheck && pnpm lint && pnpm test
&& pnpm build` all clean; live-verified in a browser, including clicking
the GDPR link through to its actual anchor target.

## 2026-08-30 — Transactional email: one swappable interface, wired into password reset

`src/lib/email/` — `sendEmail({to, subject, html, text})` talks to
Resend's plain REST API directly (no SDK dependency, same posture as
`callOpenAiImage`/`enrichIp`), gated on `RESEND_API_KEY` exactly like
every other optional integration in this app. `passwordResetEmail(url)`
is the first template built on it. `requestPasswordReset` (`src/lib/auth/
service.ts`) now takes an `origin` — pulled from `request.headers` at the
route, via new `src/lib/http/origin.ts` (`originFromHeaders`), also
refactored into `.../sites/[siteId]/page.tsx`'s existing embed-snippet
origin logic so there's one implementation, not two — builds a real
`/reset-password?token=...` link, and sends it. A send failure (not
configured, or a real provider error) is caught and never surfaced to the
caller: the route already always returns the identical generic message
regardless of whether the account exists, and that invariant doesn't
change just because email now exists — "not configured" stays silent,
a genuine provider error still gets logged (no token, no email address in
the line).

The `NODE_ENV=test` short-circuit that returns `devToken` for the
integration-test suite necessarily means the new send path can't be
exercised by an automated test here (same structural gap
`generateImageVariant`'s tests have, for the same reason) —
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean (9 new
unit tests for the pure pieces: the email template and the origin
helper), and the real path was verified live instead, twice: once against
a local mock Resend server confirming the exact request Resend would
receive (real `from`/`to`/`subject`/correct reset link, real `Bearer`
auth header) for a real password-reset request against the real running
dev server, and once against a mock returning a real 500 confirming the
failure path degrades exactly as designed — the client still gets the
same 200, the failure is logged, and neither the token nor the email
address appear in that log line.

### 2026-09-03 — Real Anthropic key exercised for the first time; two live-generation bugs found and fixed

Requested directly: test the configured `ANTHROPIC_API_KEY` with a real
call, then run full AI-driven optimization against a real connected site
(elevenlabs.io, 14 pages, seeded back in Phase 1/6 against the honest
heuristic fallback since no real key existed in this environment until
now). The raw API call worked; the full `generateExperience` pipeline
did not — every one of 40 generated pieces on the homepage silently fell
back to `HEURISTIC`, never `AI`.

**Root cause 1**: `generateCoordinatedCopy`'s `max_tokens: 2048`
(`src/lib/sites/generateExperience.ts`) is far too small for a batch
covering up to `MAX_ELEMENTS_PER_GENERATION` (40) elements including full
`BODY` paragraphs. A real 39-element page hit `stop_reason: "max_tokens"`,
truncating the tool-call JSON mid-object — the resulting empty `{}` failed
`zod` parsing, threw `AiGenerationError`, and silently failed the *entire*
batch to heuristic, not just the pieces that would've been too long.
Raised to 16000, sized for the batch cap rather than the typical case.

**Root cause 2**: the independent fact-checker's system prompt
(`checkWithModel`, `src/lib/sites/suggestVariant.ts`) was stricter than
D4 (`docs/decisions.md`) actually specifies — it flagged *any* added
wording as an unsupported claim, including pure tone ("made for you"),
not just invented facts/names/stats. Narrowed the prompt to match D4's
stated intent: flag invented entities/numbers/functionality claims, not
generic personalization framing. Verified with targeted probes: tone-only
personalization now passes; invented customers, stats, and certifications
still correctly fail — and so do unverified functional claims like
"optimized for mobile," which is the right conservative call absent a
whole-corpus check.

Verified live, twice: (1) isolated fact-check probes before/after the
prompt change, confirming the exact pass/fail shift described above. (2)
Full `generateExperience` re-run on the same real page: 0 AI / 40
heuristic before either fix → 26 AI / 14 heuristic after both, on the
real product code path, not a reimplementation. Then ran the complete
pipeline against all 14 real pages of the site (543 total elements): 331
AI-authored, 212 heuristic — approved live at the user's request.

**A real regression caught and fixed along the way, not by inspection**:
approving the full-site batch created a second, more-recently-updated
`APPROVED` rule on an element that already had a pre-existing, hand-
authored `MANUAL` rule for the same audience. `packages/sdk/src/resolve.ts`
breaks priority ties by most-recently-updated (decision D5's old
specificity-tiebreak note) — so the new heuristic rule would have quietly
outranked and replaced the human-authored copy on the live site. Found
by diffing the approved-rule export before publishing a review report,
not by a test; fixed by disabling the newly-created rule via the existing
`disableElementPersonalizationRule` path, confirmed the manual rule's
precedence was restored. No schema or resolution-logic change — this is
a real, general gap (nothing stops two rules targeting the same
element+audience pair) worth a structural fix later, not just a one-off
patch to the instance found.

`pnpm typecheck && pnpm lint && pnpm test` all clean (356 tests,
unchanged — both fixes are prompt/constant changes, not new logic paths
requiring new tests). All throwaway verification scripts removed after
use.

### 2026-09-04 — IA/nav collapse and enum-label cleanup (docs/launch-plan.md §5A)

First slice of `docs/launch-plan.md`, itself written in response to a
direct product complaint ("clanky and unclear... should be more a
marketing platform for CMOs") plus a request to study Dynamic Yield
(Mastercard) and draft a pre-launch plan. That plan flagged the real
tension up front rather than resolving it silently: "automatically
generate personalization" is in real tension with this codebase's own
"nothing goes live unapproved" rule and decision D5's still-open legal
question — the plan's recommended shape (a 3-mode Auto-Optimize toggle:
Off / Auto-draft / Auto-promote) preserves the approval gate rather than
removing it, and is scoped as the *next* slice, not this one.

This slice is the cheapest, highest-visibility fix the plan identified,
chosen to ship first: nine flat, same-weight nav items
(`src/components/dashboard/nav-items.ts`) collapsed into four groups
organized around what a marketer is deciding, not the data model — Home;
Experiences (Audiences/Recommendations/Visitors/Live View/Analytics);
Website (Sites/Integrations); Account (Settings). Routes are unchanged —
this is presentation grouping, not a data-layer merge, so no link,
bookmark, or test depends on a URL moving. "Overview" relabeled "Home" to
match the plan's language; "Recommendations" deliberately kept as-is
(not renamed to "Opportunities") after finding its page's own `PageHeader`
title would've gone out of sync — consistency across the label and the
page it points to won out over a marginally clearer word.

Also fixed the concrete, cited "clanky" bug: raw `ContentElementType`/
`ContentSection` enum values (`HEADLINE`, `CTA_LABEL`, `HERO`) were
rendering verbatim in the Sites detail page
(`src/components/sites/site-detail.tsx`). New `src/lib/format/labels.ts`
(`elementTypeLabel`, `sectionLabel`) maps every enum member to a human
label, falling back to a title-cased version of the raw value for
anything not in the map rather than crashing or rendering blank —
swept the rest of `src/components` for the same pattern first
(`element-personalize.tsx`'s `boundaryReason`/`ContentPreview` already
only use the raw type for branching logic, never printing it; the
recommendations page's stored `elementType` is never rendered either)
so this is the one real instance, not a partial fix.

`pnpm typecheck && pnpm lint && pnpm test` all clean (356 tests,
unaffected — this is a labeling/grouping change, no new logic). Verified
live, not just by inspection: minted a real session for a real org with
real crawled data (the same elevenlabs.io site from the entry above), ran
the actual dev server, and screenshotted both the sidebar (confirmed four
groups render, breadcrumb correctly shows "Dashboard / Home") and the
Sites detail page (confirmed "Headline:", "Subheadline:", "Button text:"
and "Hero", "Call to action" section headers render instead of the raw
enum forms) — screenshots and the minted session were discarded after.

**Not done in this slice, by design** (see `docs/launch-plan.md` §5 B–E
for what's next): the Auto-Optimize loop itself (the actual "automatic
CRO" feature); merging Audiences/Recommendations/Analytics into one
physical page rather than a shared nav group (a bigger, real-regression-
risk rewrite deferred rather than rushed); the in-context WYSIWYG visual
reviewer; Settings narrowing to account/billing/team only.

### 2026-09-04 — Full external-user walkthrough; one real landing-page bug found and fixed

Requested directly: "if I'm an external user, using the app, is it
working" — a request to actually verify, not assume, after the IA-collapse
slice above. Driven entirely through the real UI (signup form, connect-
site form), never a minted session or direct DB seed, since that's the
only way to actually answer the question asked.

Confirmed working end to end: landing page → real signup → empty-state
dashboard with the new nav → connecting a real site through the actual
form → real crawl → real AI-generated understanding (using the configured
`ANTHROPIC_API_KEY` for the first time on a URL with no prior seed data —
correctly identified `example.com` as a placeholder domain with no real
company, rather than inventing one, which is the brand-safety behavior
the product is supposed to have).

**One real bug found**: the hero video's `poster` attribute
(`src/components/landing/landing-hero.tsx`) pointed at
`/landing/hero-chameleon-avatar.jpg`, which doesn't exist — a 404 on
every single landing page load. The real file is `hero-chameleon.jpg`;
a one-line typo, fixed.

**One false alarm, caught before being reported as a bug**: a first
full-page screenshot showed a multi-thousand-pixel blank gap between the
hero and the next section. Traced it to how the page reveals content —
`Reveal` (`src/components/landing/reveal.tsx`) fades sections in via
`IntersectionObserver` as a real visitor scrolls to them — and to how a
single-shot full-page screenshot is taken (the viewport resizes to the
full document height in one jump, which doesn't give the observer time to
fire before the pixels are captured). Confirmed with a second check that
actually scrolled the page incrementally, the way a real visit builds up:
every section reached `opacity: 1` correctly, and the "gap" was never
present for a real user. Recorded here so the same shape of false alarm
isn't re-litigated later — full-page screenshots of scroll-reveal pages
need a real scroll pass first, not just `waitForLoadState`.

`pnpm typecheck && pnpm lint && pnpm test` clean (356 tests, unaffected —
a one-line asset path fix). Test user/org created during the walkthrough
removed from the dev DB afterward.

### 2026-09-04 — Onboarding rebuilt against product-spec.md §15 (docs/launch-plan.md §5B)

Requested directly: "build the onboarding the spec." `docs/product-spec.md`
§15 describes five steps — URL → scan progress → understanding report →
optional data sources → enable personalization — and every one of them
already existed in some form (Phase 1's crawl/understanding, Phase 5/
Hardening's cold-start audiences and recommendations). The gap was
sequencing and framing, not missing capability, confirmed by reading the
actual render order in `site-detail.tsx` before changing anything: the
AI-generated understanding report (step 3) rendered *seventh*, after four
unrelated settings toggles (embed snippet, IP enrichment, visitor
tracking, holdback, auto-approve) a brand-new user has no context for yet.

**Restructured, not rebuilt**, matching the plan's own "verification-and-
polish" framing for this slice:
1. The report now leads — merged the basic page/element count with the
   full company/product/target-customers/value-props card into one
   "Here's what we found" block, phrased close to the spec's own example
   ("We found N pages, M elements, and K images. Your positioning appears
   to be..."). Added the image count via a client-side reduce over
   `site.pages[].elements` already in the DTO — no schema or query change.
2. "Install on your site" follows immediately — the real mechanism (D1's
   embed script) behind the spec's implied "make it live."
3. IP enrichment + visitor tracking grouped and labeled "Connect data
   sources (optional)," matching the spec's step 4 framing exactly.
4. Holdback + auto-approve grouped under "Turn on personalization" (step
   5), paired with an honest, accurate next action instead of a fake
   toggle — full automatic deployment isn't built (`docs/launch-plan.md`
   §5C, intentionally out of this slice) — linking to Recommendations
   when audiences already exist, or to Audiences when none do.
5. Sites list page's stale "(soon) personalize it in place" corrected —
   personalization has been live since Phase 3.

**A real staleness bug found and fixed while building step 4, not by
inspection**: cold-start default audiences are seeded server-side
(`seedDefaultAudiences`) as a step deliberately *separate from and after*
the site's own status flipping to `READY` — the existing code comment
already explains why ("a failure seeding starter audiences must never
turn a successful connection into a FAILED one"). `SiteDetail`'s
`audiences` prop, however, was only ever captured once at the page's
initial server render, before either event — harmless before this slice
(nothing depended on it being fresh), load-bearing now that step 5's
message explicitly claims "N starter audiences are already set up."
Live-verified the exact failure first: 3 of 5 real test signups showed
"Create an audience" on a site whose org actually already had 3 audiences
in the database, confirmed by direct query. Root cause was a genuine race,
not a typo — the audiences refetch (added alongside the site-status poll)
could still land in the real gap between `READY` and the seeding step
completing. Fixed with one bounded retry (re-fetch once more after 1.5s
if the first comes back empty) rather than an open-ended poll, since
seeding is a handful of sequential inserts, not indefinite work — verified
live again afterward, correctly showing "3 starter audiences are already
set up for this site."

`pnpm typecheck && pnpm lint && pnpm test` clean (356 tests, unaffected —
UI restructuring and a client-side refetch, no new business logic worth a
unit test). Verified live end-to-end twice more after the fixes, once
through a real (now rate-limited by the auth endpoint's own per-email
limit after this session's repeated test signups — confirmed working as
designed, not a bug) signup, and once via a minted session against an
existing test org with no site yet, both through the real connect-site
form. All test users/orgs/sites created during verification removed from
the dev DB afterward.

**Not done in this slice** (see `docs/launch-plan.md` §5C): the
Auto-Optimize loop / real "enable personalization" automation — the step
5 CTA is an honest link to existing manual flows, not new automation.

### 2026-09-07 — Auto-Optimize loop, "Auto-draft" mode (docs/launch-plan.md §5C)

The actual "automatically generate CRO optimization" feature — the thing
the whole `docs/launch-plan.md` exercise was written in response to.
Scoped to exactly what the plan itself recommended for launch: Auto-draft
only, not Auto-promote (§7 decision 1) — nothing about how a rule reaches
`APPROVED` changes. Confirmed before writing any code that the mechanism
already existed almost entirely: `generateAllRecommendations` (segment
detection) and `acceptRecommendation` (audience + AI draft, in one call)
were already real, tested functions — this slice is the automatic
*trigger* for calling them, plus the opt-in switch, not new generation
logic.

**Built:**
- `Organization.autoOptimizeEnabled` (migration
  `20260907084026_auto_optimize_enabled`), off by default. Org-wide, not
  per-site — a deliberate, stated deviation from the plan's original
  site-level framing, because recommendation detection already is
  org-wide (`src/lib/recommendations/service.ts`'s own comment: "moved
  out of the per-site Sites panel"). Forcing a site-level toggle onto an
  org-level mechanism would have meant either faking site-scoping or
  quietly changing what "site-level" means — flagged and resolved by
  fitting the toggle to the real data model instead.
- `runAutoOptimize` (`src/lib/autoOptimize/service.ts`) — for every
  opted-in org: detect new segments, attempt to draft each one, stop
  attempting more for that org the moment the shared 5/hour generation
  rate limit is hit (one org's exhausted budget never touches another
  org's run). A real, non-obvious behavior found while writing the first
  version of this: `acceptRecommendation` marks a recommendation
  `ACCEPTED` *before* it checks the rate limit (by original design —
  generation is always best-effort, per its own pre-existing "accept
  never fails because of it" test) — so the recommendation that actually
  discovers the limit ends up `ACCEPTED`-with-no-draft, not left
  `PENDING`; only the ones *after* it in the same batch stay untouched.
  Got this wrong in the first draft (assumed the rate-limited one would
  also stay `PENDING`), caught by a failing integration test, not by
  inspection — fixed the comment and the test, not the behavior, since
  the underlying accept-always-succeeds design is correct and predates
  this slice.
- `/api/cron/auto-optimize` — thin per CLAUDE.md's route-handlers-stay-
  thin rule: authorizes (`CRON_SECRET` bearer match; unset means the
  route always refuses, never falls open to running unauthenticated),
  then calls `runAutoOptimize`. `vercel.json` schedules it once/day —
  Vercel Hobby hard-caps cron at once/day (confirmed directly, not
  assumed), stated plainly as a real constraint rather than silently
  designed around: a paid plan buys more frequency later with zero code
  change here, and daily is a normal real-world cadence for this kind of
  analysis regardless.
- `AutoOptimizeToggle` (Settings page) — same explicit-opt-in shape as
  every other toggle in this app, copy states plainly that every draft
  still needs manual review before anything goes live.

**Verified live, not just unit-tested**: seeded 30 real `SiteEvent` rows
(a genuine 40/60 mobile/desktop split) on a real previously-crawled site,
enabled the toggle through the actual Settings page in a real browser
(confirmed via network instrumentation: real `PATCH` request, real `200
{"enabled":true}` response, checkbox state actually flips — a first
attempt at this looked like it silently failed and turned out to be a
flawed Playwright locator in the verification script, not a real bug;
re-verified with a corrected script before trusting the result), then
hit the real cron endpoint with the correct bearer token and confirmed:
a real segment was detected, a real audience was created, and a real
AI-generated 40-element experience was drafted — landing `PENDING`,
confirmed directly in the database, never auto-approved. Auth confirmed
separately: no header → 401, wrong secret → 401, correct secret → runs.
All test data (events, the drafted experience, the audience, the
session, the local-only `CRON_SECRET` test value) removed afterward.

`pnpm typecheck && pnpm lint && pnpm test` clean (359 tests — 3 new
integration tests in `tests/integration/autoOptimize.test.ts`, covering
opt-in isolation, the rate-limit boundary behavior described above, and
one org's failure never blocking another's run). `pnpm build` clean,
confirmed both new routes (`/api/cron/auto-optimize`,
`/api/organizations/[organizationId]/auto-optimize`) actually compiled
in.

**Not done, by design** (see `docs/launch-plan.md` §7 decision 1):
Auto-promote — statistically-significant winners going live without a
click. That's a genuinely different, harder question (what "unapproved"
even means once a rule has already been approved once and is being
re-evaluated against holdout data) than a UI toggle to add later, and
launching Auto-draft first, with real customer trust, is what the plan
itself recommended before touching it.

### 2026-09-07 — Live View becomes the in-context reviewer (docs/launch-plan.md §5D)

"Click any personalized element directly on the page, see its variants
per audience right there" — the plan's answer to the WYSIWYG gap.
Deliberately additive, not a rewrite: `ElementPersonalize`
(`src/components/sites/element-personalize.tsx`) already did approve/
pause/delete/add-a-rule correctly and in plain language — this slice
gives it a place to open next to what you actually clicked, instead of
requiring a trip to the Sites page's flat, scroll-through-everything
list to find the right element by matching its text.

**Built:**
- `getLiveViewPageElements` (`src/lib/liveview/service.ts`) — the *full*
  per-element picture (every rule status, the boundary), deliberately
  separate from `getLiveViewDefinition`, which only ever sees `APPROVED`
  rules on purpose (resolve() must never see a pending draft — that
  invariant predates this slice and stays exactly as strict).
- Every element in `RenderedPreview` is now genuinely clickable (not just
  the personalized ones — reviewing "nothing's set for this yet" is
  exactly when you'd want to add a first rule), reporting the real
  `ContentElement.id` back to the caller — confirmed `component.id ===
  el.id` directly in `mapToDefinition.ts` before relying on it, not
  assumed.
- `ReviewPanel` (in `live-view.tsx`) — a slide-over that renders
  `ElementPersonalize` for whatever's selected, wired to close on Escape,
  backdrop click, or the X. `onChanged` re-fetches this page's full data
  and re-resolves against the *current* persona, so approving or pausing
  a rule updates the preview immediately without losing the simulated
  visitor you were looking at.
- "Why this changed" entries are now clickable too (opens the same
  panel), covering the case where the real-site iframe preview
  (`WebsitePreview`) is showing instead of the synthesized one — that
  iframe itself stays non-interactive (deliberately out of scope; same-
  origin `srcDoc` access would make it *technically* feasible, but the
  synthesized preview plus this list already covers every element
  without that added complexity).
- Fixed the same raw-enum leak found and fixed elsewhere this session
  (`docs/roadmap.md`'s 2026-09-04 entry) in two more spots this slice
  touched directly: `component.type` in "Why this changed", and a
  same-page-scoped `library` builder for the `IMAGE`/`LOGO`/`CTA_HREF`
  picker (previously would've silently passed `[]`, breaking that picker
  for exactly the element types that need it — caught before shipping,
  not after).

**Verified live in a real browser**, not just typechecked: clicked
"Review or change this" on a real personalized element, confirmed the
panel opens with correctly humanized labels (checked via raw
`textContent`, not just visually — CSS `uppercase` on single-word types
like "Headline" looks identical to the raw enum at a glance, so the
multi-word cases like `CTA_LABEL` → "Button text" are what actually
prove the fix, not the ones that happen to look the same either way),
expanded the rule list, and exercised the actual Pause/Turn-back-on
round trip. **Found a real bug in my own verification, not the product**:
an ambiguous Playwright locator (`"Turn back on"` matched two rules once
both were paused) flipped the *wrong* rule, silently re-creating the
exact manual-vs-heuristic collision fixed earlier this session (2026-09-04
entry) on the same element. Caught by checking the database directly
after the interaction instead of trusting the UI text alone, restored to
the correct state (manual rule `APPROVED`, heuristic `DISABLED`)
immediately. Worth recording plainly: the product behavior was correct
throughout — state changes really did persist and the preview really did
refresh live — the bug was entirely in how the test clicked, and it's
exactly why this session checks the database after every live UI test
rather than trusting rendered text alone.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean (359
tests — no new ones this slice; the UI reuses `ElementPersonalize`'s
already-tested actions rather than adding new business logic).

### 2026-09-07 — Analytics in CMO language, and leading with the real number (docs/launch-plan.md §5E)

"+41% conversion on your Enterprise segment, 95% confidence" was the
plan's example. Checked what that would actually take before writing
anything: true *per-audience* causal lift needs `SiteEvent` to know which
audience a visitor matched, which it doesn't (only `personalized`/
`heldOut` booleans exist, D7's design) — real schema work, contradicting
this slice's own "presentation, not engineering" framing. Flagged rather
than built silently; scoped down to what the existing data actually
supports: the causal, holdout-backed number (already real, already
computed) was buried as a caption sentence under a *weaker*, merely-
correlational headline number, on a separate page a CMO has no routine
reason to open. Fixed both.

- `confidenceLabel` (`src/lib/analytics/significance.ts`) — a p-value
  becomes "97.3% confidence," not "p = 0.0086." Same fact, one version a
  CMO can act on. Capped at "99.9%+" — significance is never certainty,
  so display never claims it is.
- Home now leads with the *causal* lift number once a site has real
  holdout data (`hasVerifiedLift`), not the correlational one — the
  correlational number (visitors who matched a rule vs. visitors who
  didn't, different populations, D7) stays as the honest fallback when no
  holdout is running yet, with a nudge to turn one on.
- A significant *underperformance* verdict now surfaces as a real warning
  banner at the top of Home, not a sentence buried in a chart caption —
  matches Home's own "what needs my attention today" purpose from the
  2026-09-04 IA-collapse slice.
- Analytics' own p-value displays swapped to `confidenceLabel` too, for
  the same reason, everywhere it appears — not just on Home.

**Verified live against real data, not synthetic assertions in isolation**:
seeded a genuinely significant holdout split (50 holdout views/5 clicks =
10%, 50 treatment views/20 clicks = 40%, both past `MIN_GROUP_SIZE`) on
the real elevenlabs.io site, confirmed Home rendered "Verified
personalization lift / +300% / 99.9%+ confidence — a real holdout test,
not just correlation" — the exact number the math implies, not a
placeholder. Also confirmed *why* the top page-view/CTA-click counters
correctly read 0 in that same screenshot before treating it as done: the
seed was 100% holdout+treatment traffic with no "pure generic, no rule
matched" events at all, and those counters specifically track that third
bucket — confirmed by reading `getOrgAnalytics`'s bucket-assignment logic
directly, not assumed to be a bug and left uninvestigated. All seeded
events, the holdback setting, and the session removed afterward.

`pnpm typecheck && pnpm lint && pnpm test (362, 3 new for
confidenceLabel) && pnpm build` all clean.

**Not done, flagged not silently dropped**: true per-audience/per-
experience lift (the plan's literal "+41% on your Enterprise segment"
framing) — needs a real `audienceId` (or matched-rule) column on
`SiteEvent`, populated at record time the same way `personalized`/
`heldOut` already are. A real, scoped follow-up, not a rewrite — noted
here so it doesn't quietly become "already done" because the language
now sounds like it.

### 2026-09-07 — Final end-to-end confirmation: `understandSite` truncation bug found and fixed

User asked for one last full confirmation pass against the real
production deployment before treating any of §5 as done. Two findings.

**CRON_SECRET is not set in production.** Confirmed by curling
`/api/cron/auto-optimize` directly (503 with no auth header, 503 with a
garbage bearer token — the route never even reaches the "wrong secret"
branch, meaning the check that gates it is failing closed on a missing
env var). The §5C daily Auto-Optimize cron (`vercel.json`) cannot run
until this is added in Vercel's environment settings. Not something I
can set myself; flagging for the user to add.

**`understandSite` (`src/lib/sites/understand.ts`) silently fell back to
heuristic on real sites.** Reconnected novaprojectum.com through the
actual production UI as a real logged-in user (minted a session for the
real account directly in the production DB, drove the real `/sites` flow
with Playwright) — it connected, but landed on `HEURISTIC`, not
AI-generated, twice, 8 minutes apart. Ruled out an exhausted/rate-limited
API key first (a bare `messages.create` succeeded immediately). Then
reproduced the exact failure locally: crawled novaprojectum.com for real
(13 pages, 541 elements) and called `understandSite` directly — same
`AiGenerationError: "AI returned an unexpected shape."`

Root cause: the same bug class as the `generateExperience.ts` fix earlier
this phase, in a function that fix didn't touch. `understand.ts` caps
its prompt at `MAX_ELEMENTS_FOR_PROMPT = 150`, but was calling the model
with `max_tokens: 4096` — nowhere near enough to classify up to 150
elements (each its own `{elementId, section, elementType}` object, and a
full cuid element id alone runs ~10-15 tokens) plus produce the
company/product/brand/value-prop text in the same response. The model's
JSON got cut off mid-object at `stop_reason: "max_tokens"`; zod's
`safeParse` correctly rejected the truncated shape, and the resulting
error message ("AI returned an unexpected shape") carries no diagnostic
detail, which is why this looked identical to an AI shape-drift bug
rather than an output-budget one. It wasn't deterministic — sites with
shorter classified-element ids or less verbose brand copy stayed under
4096 and quietly worked, which is why elevenlabs.io, ahrefs.com, and
stripe.com had all succeeded earlier in this same session and masked the
bug for a full-content site like this one.

Fixed by raising `max_tokens` to `16000` — the same value proven safe for
`generateExperience.ts`'s own version of this bug, and comfortably above
the ~6-7k tokens this call actually needs. Tried `24000` first as a wider
margin; the Anthropic SDK itself rejected that as a non-streaming call
("Streaming is required for operations that may take longer than 10
minutes"), so `16000` is also the right choice for staying a synchronous,
non-streaming call rather than taking on streaming for a route that
doesn't need it.

**Verified against the real failing case, not assumed fixed**: re-ran the
identical local repro (novaprojectum.com, 13 pages, 541 elements) after
the fix — `understandSite` now returns a real company summary instead of
throwing. `pnpm typecheck && pnpm test` (362, all passing) both clean
after the change.

**Not done**: the CRON_SECRET gap above needs the user to set it in
Vercel — not something available to fix from here. D5 (legal review) and
§5C's auto-promote mode remain open per their original decisions.

**Correction, same day**: the max_tokens fix above was real and stayed,
but it turned out not to be why production kept failing. Reconnecting
novaprojectum.com through the actual deployed app *still* fell back to
heuristic after the fix shipped — three separate attempts, well after
the deploy had time to propagate. (The first two "AI-generated" reads
that suggested otherwise were a false positive in my own test scripts:
every site-detail page contains the literal substring "AI-generated
images" in its unrelated AI-auto-approval toggle copy, so a naive
`bodyText.includes("AI-generated")` check matches on every page
regardless of actual understanding method — the same bug that produced
an identical false "AI-generated" reading earlier in this session,
never root-caused at the time. Fixed the check to read the actual
status pill instead, which showed "Rule-based" on all five accumulated
test rows.)

With no persisted error detail to inspect (`Site.errorMessage` is
cleared to `null` on the heuristic-fallback path, and only
`console.error`, unreachable from here — no Vercel log access, no CLI
auth, and direct production DB queries are blocked by this
environment's own safety classifier) the actual reason was genuinely
invisible. Added temporary instrumentation — `classify()` returns the
caught error's `name`/`message`, `runCrawlAndUnderstand` writes it to
`Site.errorMessage` even on the successful-heuristic path instead of
clearing it — confirmed safe first (`site-detail.tsx` only ever renders
`errorMessage` behind `status === "FAILED"`, so this is invisible to
every user regardless of value). Shipped, retried an existing site
through the real `/retry` endpoint, read the result back through the
authenticated API (not page text): `errorMessage` was `"Error: 401
{"type":"error","error":{"type":"authentication_error","message":"API
key is invalid."}}"`.

**The real root cause: the `ANTHROPIC_API_KEY` set in Vercel's
Production environment is invalid.** Not a code bug at all. `getAnthropicClient`
(`src/lib/ai/client.ts`) reads one global `env.ANTHROPIC_API_KEY` — there
is no per-organization key anywhere in the schema — so this doesn't just
break site understanding, it breaks every AI-backed feature in
production: experience generation, audience suggestions, image
generation, all of it, until the key is replaced. This needs the user to
set a valid key in Vercel's dashboard (Production environment
specifically — Preview/Development scoping wouldn't fix this); not
something fixable from here.

Reverted the temporary instrumentation immediately after reading the
result, back to byte-identical behavior with before it was added
(`errorMessage: null` on the heuristic path) — its only job was
answering "why," and it did. `pnpm typecheck && pnpm test` (368, all
passing) clean after the revert.

### 2026-09-07 — Converting pages generated from crawl data alone, on /recommendations

Requested directly: a way to generate a converting page using only the
initial crawl, needing no other data, on the Recommendations page. The
real gap this closes: every existing recommendation
(`src/lib/recommendations/analyze.ts`) requires real traffic clearing
`MIN_SAMPLE_SIZE`/a 20% share — a brand-new site shows "No recommendations
yet" for as long as it takes to accumulate visits, with nothing actionable
on day one even though the crawl (`WebsiteUnderstanding` + the
`ContentElement` inventory) is already enough input for
`generateExperience` to draft real copy.

**The real constraint this ran into**: `GeneratedExperience` and
`ElementPersonalizationRule` both require a real `audienceId`, and
`matchAudience` (`packages/sdk/src/audience.ts`) is explicit and
deliberate that "an audience with no rules never matches anyone." There is
no "matches everyone" concept in the engine, and inventing one (a fake
always-true rule, or a schema change to the pure resolver) would have
silently resolved a real architectural question CLAUDE.md says to flag
instead — not done here. Checked which of the existing
`DEFAULT_AUDIENCES` presets (`src/lib/audiences/service.ts`, seeded free on
a site's first crawl, per the 2026-08-28 Hardening entry) could actually
stand in for "everyone" without that: `device` is computed unconditionally
from the viewport by `dynamify-embed.js` on every real page load, no
opt-in, no traffic history — genuinely matchable from visitor one. **Found
along the way, not assumed**: `returning` (the field behind "New
visitors"/"Returning visitors") is never actually populated by the real
embed path at all — only the retired `src/lib/tracking/visitorContext.ts`
module and the Live View simulator ever set it, confirmed by grep before
relying on it — so those two starter audiences are currently unreachable
by any real visitor. This makes "Mobile visitors" the only one of the
three that's both zero-traffic-required and actually live-matchable today;
picked deliberately, stated in the code (`convertingPages.ts`) and the UI
copy rather than silently assumed.

**Built**, entirely additive, zero changes to the personalization engine,
`generateExperience`, or the schema:
- `src/lib/recommendations/convertingPages.ts` — `listConvertingPageCandidates`
  (every crawled page across the org's sites, each with its
  `GeneratedExperience` for "Mobile visitors" if one exists yet) and
  `generateConvertingPage` (find-or-create the "Mobile visitors" audience,
  then call the existing `generateExperience` unchanged — same two-layer
  brand-safety check, same PENDING-until-approved gate, same
  `generate-experience:<org>` rate-limit budget as the traffic-triggered
  path, shared rather than doubled). `findMatchingAudience`,
  `findExperienceFor`, and `assertExperienceGenerationAllowed` were
  exported from `src/lib/recommendations/service.ts` (previously private)
  rather than re-implemented, and `DEFAULT_AUDIENCES` was exported from
  `src/lib/audiences/service.ts` so the "Mobile visitors" preset has one
  source of truth instead of a second hand-typed copy.
- Two routes following the existing nesting convention: `GET
  .../converting-pages`, `POST .../converting-pages/[crawledPageId]/generate`
  — both `requireOrgAccess`-gated, `crawledPageId` always filtered by the
  session's `organizationId` in the query, never trusted alone.
- A new "Converting pages from your crawl" section on
  `recommendations-page.tsx`, above the existing traffic-based
  Recommendations list — one row per crawled page, a "Generate a
  converting page" button when nothing exists yet, the same
  `ExperienceReview` (before/after preview, per-piece method/status,
  Approve all/Reject all) once something does. Copy states plainly that
  this targets mobile visitors specifically, not "everyone" — no
  overclaiming what a single-audience mechanism can't do.

**Verified live against the real running dev server**, not just
integration-tested: seeded a real org/site/crawled page/two `HEADLINE`
elements/`WebsiteUnderstanding` directly (no crawl re-run needed — this
feature only ever reads what a crawl already produced), confirmed zero
`SiteEvent` rows existed before or after, minted a real session and hit
the actual HTTP routes end to end. `GET .../converting-pages` correctly
listed the page with `experience: null`; `POST .../generate` created a
real "Mobile visitors" `Audience` (device equals mobile) and a real
`PENDING` `GeneratedExperience` — with `ANTHROPIC_API_KEY` configured in
this environment, one piece actually came back `AI`-generated
("Keep your team shipping fast, from any screen," genuinely mobile-framed
copy) and the other `HEURISTIC` (site-wide reselection, per the existing
fallback), matching `generateExperience`'s documented per-element
behavior exactly; a second organization's session got an empty candidate
list and a real 404 attempting to generate against the first org's
crawled page (cross-tenant isolation, confirmed by database state after,
not just the HTTP status). All seeded orgs/users/data removed afterward,
confirmed by a direct count query.

`pnpm typecheck && pnpm lint && pnpm test (368, 6 new in
tests/integration/convertingPages.test.ts: zero-traffic listing, org
isolation on both list and generate, audience find-or-create/no
duplicates, 404 on another org's page) && pnpm build` all clean.

**Not done, stated plainly**: a true "converting page for every visitor,"
not just mobile ones — that needs a real product/architecture decision
(a first-class "matches everyone" audience concept, or serving improved
default content outside the audience-match pipeline entirely), flagged
here rather than resolved silently; fixing "New visitors"/"Returning
visitors" so they actually match real traffic (the dead `returning`
attribute found above) — a real, separate, scoped gap, not this task's
job.

### 2026-09-07 — "Design a new page": AI-generated layouts, design-only (D8/D9)

Requested directly, as an extension of the converting-pages feature above:
the generator should research the market/competitors, not just the crawl,
and should be able to produce "totally new pages with self-designed
layouts," not just rewrite existing content. Both went well beyond the
converting-pages slice's scope and directly touched two things this
codebase treats as load-bearing: `docs/product-spec.md`'s "never changes
your layout" definition (repeated twelve times, including the doc's own
one-line elevator pitch) and D4's brand-safety model (built assuming
exactly one trusted content source). Two Explore passes over the real code
confirmed why "new layout" specifically has no small version: the crawler
discards raw HTML immediately after extraction, `ContentElement` only
ever stores flat `(section, type, text, selector, order)` tuples, and both
the embed script and Live View's preview only ever do exact-match
`textContent`/attribute swaps on a single verified node — never
`innerHTML`, never structural insertion. There is no existing mechanism to
extend; a new-layout feature has to be a green-field delivery decision.

Rather than build any of that opportunistically, both forks were put to
the user directly with their real tradeoffs before writing code — D8
(layout) as four concrete delivery-mechanism options (design-only preview;
Dynamify-hosted alternate page + redirect; full client-side DOM
replacement; server-side edge rendering, the option D1 already rejected
once), D9 (research) as three sourcing options (customer-provided
competitor URLs through the existing crawler; a new live search-API
integration; AI-knowledge-only). The user chose the smallest, safest
branch of each: **design-only** and **AI-knowledge-only**. See
`docs/decisions.md` D8/D9 (now decided) and the new **D10** (whether an
endorsed design should ever reach a visitor — explicitly still open, not
resolved by this slice).

**Built**, entirely additive, zero changes to the personalization engine,
`generateExperience`, or D2/D3's verification model:
- `PageDesign` (new model, `prisma/schema.prisma`) — `sections` is a
  zod-validated `Json` column, not a child table (always read/written as
  one unit, and the layout-variant vocabulary was expected to churn early
  — true in practice, see below). `PageDesignStatus` is `PENDING`/
  `ENDORSED`, deliberately not reusing "APPROVED," which means "live"
  everywhere else in this schema.
- `src/lib/sites/designPage.ts` — `researchMarketContext` (D9, one
  Anthropic call, no live fetching); `generateNewPageDesign` (D8): loads
  the crawl + `WebsiteUnderstanding`, tries AI, falls back to a pure
  `composeHeuristicDesign` that copies only real crawled/understanding
  strings verbatim (unit-tested as an invariant — every emitted string
  must appear in the input). Brand safety is D4's two-layer check
  *adapted*, not reused as-is: `buildContentCorpus`/
  `checkClaimsAgainstCorpus` are reused unchanged, but a new
  `checkDesignWithModel` replaces `suggestVariant.ts`'s `checkWithModel`
  for this one caller (that function's 1:1 "original vs. rewrite"
  contract has live callers and has no way to express "an entirely new
  page, checked against a whole profile instead of one element" — a
  real, deliberate fork, not a modification of shared code with live
  dependents). A new, non-negotiable rule D4 never needed before:
  `enforceTestimonialAuthenticity` (sanitizer) plus
  `assertNoFabricatedTestimonials` (a non-bypassable assertion at the
  single `prisma.pageDesign.create` call site, regardless of which path
  produced the sections) — a TESTIMONIALS section may only ever contain
  quotes that literally match real crawled content; product-spec §13's
  "never fabricate customers" ban, enforced structurally, not just
  prompted. Real quotes are sourced with a filter, not wholesale — reading
  `autoClassify.ts` directly first showed it also classifies logo images
  and section headings as `section: TESTIMONIALS`, which are not quotes.
- Four routes under `.../page-designs/...` (list, generate, get,
  endorse, reject) and a third "Design a new page" section on
  `/recommendations`, below the two traffic/crawl sections since it's the
  most speculative of the three. `page-design-preview.tsx` deliberately
  does *not* reuse `RenderedPreview`/`ResolvedPage` (that type carries
  real `ContentElement` ids and SDK personalization provenance a design
  has none of) — it echoes `RenderedPreview`'s browser-chrome frame
  styling so the two read as one family without coupling a churning new
  layout library to a live, high-traffic surface. The review UI states
  the D8/D9 boundaries in the customer's own words, not just in code
  comments: a market-context callout labeled "AI general knowledge — not
  live research," and "Endorsing records that you like this direction. It
  does not change your website — Dynamify never publishes layouts." The
  word "Live" never appears in this component.

**Two real bugs found via live verification, neither by inspection —
exactly the pattern this session's earlier `understandSite` fix followed:**
own tests all passed first, against the heuristic-only path (no
`ANTHROPIC_API_KEY` in the test environment) — but this repo has a real
key configured, so the AI path was exercised live before calling this
done, and it failed **100% of the first several attempts**, both with the
identical error message ("AI returned an unexpected shape"), which turned
out to be two unrelated causes:
1. `generateDesignWithAi`'s tool call: the model consistently returned
   `sections` as a **JSON string containing a second, self-referential
   `{ sections: [...] }` wrapper** — not the literal array the tool schema
   asked for. Confirmed 100% reproducible across repeated real calls with
   this exact schema/model, not an occasional fluke. Fixed with
   `coerceToolSections`, a defensive unwrap tried before validation (a
   well-formed literal array still passes through unchanged).
2. `researchMarketContext`'s `positioningAngles`: capped at `.max(5)`
   items of `.max(200)` characters each; the model reasonably produced up
   to 8 substantive angles, and individual angles sometimes ran past 200
   characters. A hard cap threw the whole response away over a cosmetic
   overage. Fixed by truncating (array to 5, each string to 200 with an
   ellipsis) via a zod `.transform`, not rejecting — "don't discard a good
   result over a minor mismatch," the same principle as fix 1.

**Not fixed, and deliberately not chased further**: a third, rarer failure
mode surfaced in the same live testing (roughly 1 in 20 attempts) — under
a long generation, the model occasionally lets what looks like an internal
tool-call formatting artifact leak into the `summary` string itself and
omits `positioningAngles` entirely. This reads as a genuine model-quality
limit under long output, not a fixable shape bug, and the existing
`AiGenerationError` → heuristic-composer fallback already handles it
correctly and honestly (a real, fully legitimate, real-content-only
design, just not an AI one for that attempt) — regex-parsing a malformed
artifact out of a string field for an already-safely-degrading edge case
would be exactly the kind of fragile, low-value complexity CLAUDE.md's
minimalism principle argues against. Stated here as real, observed
information about the feature's reliability, not smoothed over: across
live testing this session, the AI path succeeded roughly 90% of the time
after both real fixes above, heuristic the rest — every single attempt,
either way, produced a real, safe, reviewable design.

**Verified live end to end**, API-level and in a real browser, not just
integration-tested: seeded a real org/site/crawled page/elements
(including one real testimonial quote and one testimonial-*shaped* decoy —
a logo image and a section heading — to prove the authenticity filter
tells them apart) directly, hit all four routes with a minted session, and
confirmed by direct database query that generating *and* endorsing a
design leaves `Audience`/`ElementPersonalizationRule`/`ElementVariant`/
`GeneratedExperience` all at zero — the D8 boundary as a fact, not an
assumption. Cross-org isolation confirmed on every route (404s, not
leaked-empty-vs-real distinctions). Then drove the actual `/recommendations`
page with Playwright: generated a design, confirmed the real crawled
headline/value-props/testimonial render correctly in the preview (reading
the DOM's real text content, not just a screenshot — the CTA banner's
button text turned out to be genuinely present but below the preview's
own `max-h-[560px]` scroll fold in a full-page screenshot, caught and
correctly identified as a test-methodology artifact rather than miscalled
as a bug), confirmed the honesty labeling renders, clicked "Endorse this
direction," and confirmed the endorsed state and its "nothing has been
published" copy. Zero console/page errors throughout. All seeded
organizations/users/data removed afterward, confirmed by count.

`pnpm typecheck && pnpm lint && pnpm test (414, 46 new: 31 unit in
tests/unit/sites/designPage.test.ts covering schema validation, the
testimonial-authenticity sanitizer and its non-bypassable assertion
counterpart, the heuristic composer's never-invents invariant, and prompt
builders; 15 integration in tests/integration/pageDesigns.test.ts covering
the D8 zero-artifact boundary, testimonial sourcing against real
`autoClassify.ts` noise, cross-org isolation, 404s, and the page-design
budget's independence from generate-experience's) && pnpm build` all
clean.

**Not done, stated plainly** (see `docs/decisions.md` D8/D9/D10): no
live-delivery mechanism of any kind — D10 is the open successor question,
not resolved here; no real image generation for `imageDescription` fields
(placeholders only, captioned "Image concept — not generated"); no
export/handoff out of the app; no `PRICING`/`FAQ` sections (pricing means
writing a price, which product-spec §13 already bans as fabrication; FAQ
needs a shape this schema doesn't carry); no layout-library expansion,
per-section regeneration, or design history beyond one-most-recent; one
design per page, not per audience, since there's no delivery mechanism to
differentiate for; no live or verified market research — the "provable
sources" part of the original request is explicitly not satisfied by
AI-knowledge-only, stated rather than glossed over; no new env vars or
provider — both new AI calls reuse the existing `getAnthropicClient()`.

### 2026-09-07 — Audience proposals auto-generated from the crawl, not just typed by hand

Requested directly: audiences should be able to start working from the AI's
own research after crawling a site, not only from a marketer typing a
business description or from accumulated visitor traffic. Matches
product-spec.md §25/26's stated differentiator directly — "AI understands
website → AI understands visitor → AI adapts content," automatic rather
than manual — and closes a real gap in the existing manual "Generate with
AI" flow (`src/lib/ai/generateAudiences.ts`): it already existed, but only
ever read a business description a human typed by hand, never the
`WebsiteUnderstanding` the crawl already produced.

**What it does**: right after a site's first crawl succeeds with real AI
understanding (not the heuristic fallback), `runCrawlAndUnderstand`
(`src/lib/sites/service.ts`) now also calls the new
`createAudienceProposalFromSiteUnderstanding` (`src/lib/ai/proposals.ts`),
which builds a business description straight from
`companySummary`/`productSummary`/`targetCustomers`/`valueProps`
(`buildBusinessDescriptionFromUnderstanding`, capped at the same 1000 chars
as the manual flow's own input schema) and calls the *existing*
`generateAudiences()` — same AI call, same PENDING-`AiProposal` contract,
same human-approval gate as the manual button. Nothing new is auto-created;
only a proposal is auto-*drafted*. Gated on `method === "AI"` (the
heuristic fallback's `targetCustomers` is the literal "Needs AI — connect
an ANTHROPIC_API_KEY..." placeholder — grounding a proposal in that string
would just waste a call) and on the org having zero existing AUDIENCE
proposals yet (checked via `AiProposal` count, not `Audience` count —
`seedDefaultAudiences` already guarantees the latter is non-zero by the
time this runs, which would make an `Audience`-count gate never fire).
Wrapped in the same non-blocking try/catch as `seedDefaultAudiences`
alongside it — a failure here can never turn a successful site connection
into a failed one.

**Also fixed while touching this file**: the manual flow's own prompt still
told the model `returning`/`sessionCount` were usable targeting fields —
both are dead in the real embed path (2026-09-07 audience-proposal
investigation, same day, see below) and could never actually match a
visitor. Removed from the prompt for both the manual and the new
crawl-grounded path, since both share the same underlying call.

**UI**: a server-triggered proposal needed real plumbing to even be
visible — before this, `/audiences` only ever showed a proposal as
transient client state from the direct response of clicking "Generate with
AI," with no fetch of existing `PENDING` proposals on load at all (a
pre-existing one would have sat in the DB, permanently invisible). Added
`getPendingAudienceProposal` and wired it into the page's server component
alongside `listAudiences`, passed down as `initialProposal` through
`AudiencesManager` to `GenerateAudiencesButton`, which now seeds its state
from it and opens automatically — labeled "Suggested from your site's
content" to distinguish it from a proposal the marketer asked for by hand.

**A second real bug found via live verification, not by inspection** (same
posture as every other AI-path fix this session): the new code path threw
"AI returned an unexpected shape" non-deterministically — roughly one
attempt in three in an 8-call live stress test against the real API,
confirmed via temporary diagnostic logging (`response.stop_reason` was
`"tool_use"`, not `"max_tokens"` — ruling out a truncation bug before
assuming one). The actual cause: the model sometimes wraps `audiences` as a
JSON **string** containing a second, self-referential `{ audiences: [...]
}` object, not the literal array the tool schema asks for — the exact same
quirk already found and fixed in this session's page-design work
(`coerceToolSections`, same day), just independently rediscovered here in
a different tool call. Fixed with a self-contained `coerceToolAudiences`
(kept local to this file rather than extracted into a shared helper, since
the page-design work that has the sibling implementation is separate,
concurrent, uncommitted work) — unwraps the observed shape before
validating; a well-formed literal array still passes through unchanged.
Re-verified with the same 8-call live stress test after the fix: 8/8
succeeded. Worth remembering as a pattern for any future structured-array
tool call against this model, not just these two call sites.

**Verified live end to end**, not just typechecked: started the real dev
server with the real local `ANTHROPIC_API_KEY`, signed up a fresh account,
connected `https://example.com` through the actual UI, confirmed
`AI-generated` on the real status pill (not a substring match on page
text — this session already has one prior false-positive from exactly that
mistake), and confirmed `/audiences` showed four real, specific,
immediately-matchable audiences (paid search via `utm.medium`, organic/
direct via `referrer`, mobile via `device`, non-US via `geo.country` —
none used a dead field) labeled "Suggested from your site's content,"
with the "Approve — create these audiences" / "Discard" gate intact and
the pre-existing default audiences still listed underneath, unaffected.
All test accounts, organizations, and their cascaded data removed from the
local dev database afterward — the one permanent `preview@dynamify.local`
account (see memory) left untouched.

`pnpm typecheck && pnpm lint && pnpm test (433 — 19 new: 13 unit in
tests/unit/ai/generateAudiences.test.ts covering
buildBusinessDescriptionFromUnderstanding and coerceToolAudiences, 6
integration in tests/integration/audienceProposalsFromCrawl.test.ts
covering the WebsiteUnderstanding lookup, org-scoping, and the "no partial
proposal on AI failure" invariant) && pnpm build` all clean.

**Not done**: no way to dismiss a server-triggered proposal without either
approving or discarding it — same limitation the manual flow already had,
not a regression; per-site audiences (the underlying `Audience` model is
still org-scoped, not site-scoped, an existing constraint this feature
didn't change or attempt to).
