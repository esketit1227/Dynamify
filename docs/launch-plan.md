# Launch Plan: Dynamify as a CMO-Ready Marketing Platform

**Status:** proposal, not yet executed. Written in response to a direct request
to study Dynamic Yield (Mastercard) and draft the final plan before launch.
Nothing in this document has been built yet — see "Decisions needed before
starting" at the end before any of it becomes roadmap truth.

**Trigger complaint:** the app is "clanky and unclear," doesn't automatically
generate CRO optimization and personalization, and needs to read as an easy,
straightforward marketing platform for CMOs.

---

## 1. What Dynamic Yield actually does

Researched directly (dynamicyield.com, Mastercard's product pages, Gartner
coverage, Capterra/G2-style breakdowns — the Mastercard URL itself returned
403 to automated fetch, so this is reconstructed from its own marketing site
and third-party coverage, not scraped verbatim). The parts that matter for
this plan:

| Capability | What it does | Relevant to Dynamify? |
|---|---|---|
| **Predictive Targeting** | Every A/B test automatically becomes a personalization opportunity — the platform detects which segment prefers which variant and starts serving it to that segment without a human writing a targeting rule. | **Yes — this is the single biggest gap.** Dynamify has every underlying piece (recommendations, generation, holdout, significance testing) but never connects them into one loop. |
| **AdaptML** | Continuous, model-driven traffic allocation toward better-performing variants (propensity-weighted, not a fixed 50/50 split). | Partially relevant — Dynamify's current holdout is a fixed-percentage control group, not adaptive allocation. Worth a v2, not launch-blocking. |
| **A/B / multivariate / multi-armed bandit testing** | Multiple testing methodologies depending on traffic volume and risk tolerance. | Dynamify only has fixed-holdout + a two-proportion z-test. Good enough for launch; bandits are a real v2 idea. |
| **Product recommendations (collaborative/content-based/hybrid)** | Algorithmic product recommendations for ecommerce, plus a merchandising rule builder (pin/suppress specific items). | Out of scope for launch — needs live commerce data Dynamify's ecommerce layer doesn't have yet (`docs/ecommerce.md` is foundation-only). |
| **WYSIWYG visual editor** | Marketers change copy, banners, popups in a live visual preview, no code, no dev ticket. | **Directly relevant.** Dynamify's closest equivalent (Live View) is a separate simulator page, not an in-context "click the thing, see the variant" editor. |
| **Templates / "recipe" library** | Pre-built personalization plays (e.g. "welcome back returning visitors," "urgency messaging for cart abandoners") a marketer just switches on. | **Directly relevant** — this is the fastest path to "automatic" that doesn't require inventing new AI capability, just packaging what Dynamify already generates. |
| **Embedded CDP / audience sync to ad platforms** | Unifies customer data across touchpoints, pushes segments to Meta/Google. | **Out of scope.** Dynamify's own product-spec (`docs/product-spec.md` §22) explicitly states it is not a CRM. Pushing segments to ad platforms is a different product category. |
| **Cross-channel (web, app, email, SMS)** | One platform orchestrates personalization everywhere, not just the website. | **Out of scope for this launch.** The core promise (`CLAUDE.md`: "one page, one URL, per-visitor content") is website-only by design. Widening to email/SMS/app is a different, much larger product. |
| **Shopping Muse (genAI shopping advisor)** | A conversational LLM layered on top of recommendations. | **Out of scope.** `docs/product-spec.md` §22 explicitly rules out "a chatbot." |
| **Mastercard transaction-data enrichment** | Predictive spend models from anonymized card-network data. | **Not replicable** — this is a Mastercard-specific data asset, not a feature Dynamify can build toward. Noted for completeness only. |

**The honest read:** Dynamic Yield's breadth comes from being a much larger,
older platform (CDP + omnichannel + ecommerce + ads). Chasing that whole
surface before launch would abandon Dynamify's actual differentiator — "make
your *existing* website smarter without rebuilding it" — for a much slower,
much bigger product. The plan below deliberately takes the two ideas that
transfer cleanly (an automatic optimization loop, and a no-jargon visual
editor) and explicitly rejects the ideas that don't (CDP, omnichannel, ads
sync, chatbot) — see §6.

---

## 2. Where Dynamify already stands (verified against `docs/roadmap.md`, not assumed)

This is further along than "clanky and unclear" suggests. Already built and
working:

- Site crawl + AI website understanding (Phase 1)
- A verified embed script that safely swaps only content it can confidently
  match, on a real customer's live DOM (Phase 2)
- AI text/CTA/image personalization with two-layer brand-safety checking —
  a whitelist pass plus an independent fact-check model call (Phase 3/4, D4)
- **Recommendations**: the platform already detects real segment opportunities
  from traffic ("38% of your traffic is LinkedIn...") and proposes an audience
  (Phase 5)
- **AI-generated full-page experiences** per audience, approval-gated
  (`generateExperience`, verified working end-to-end this session after
  fixing two real bugs — an output-token budget too small for multi-element
  batches, and an overly strict fact-checker)
- **A/B holdout + statistical significance + underperformance alerts** — a
  real control group, a real two-proportion z-test, a real "significantly
  underperforming, review your rules" flag (Hardening, 2026-08-28)
- Real behavioral targeting: visitor intent/stage scoring actually feeds the
  personalization engine, not just a dashboard number (Hardening, 2026-08-28)
- Analytics with real generic-vs-personalized lift reporting
- A real pricing page

**The problem isn't missing capability. It's that none of these pieces are
connected into one story, and the vocabulary exposed to the user is the
internal data model, not a marketer's.**

---

## 3. Root cause of "clanky and unclear" (grounded in the actual code, not a guess)

- **Nine top-level nav concepts** with overlapping meaning to a marketer:
  Overview, Sites, Audiences, Visitors, Live View, Analytics, Recommendations,
  Integrations, Settings (`src/components/dashboard/nav-items.ts`). A CMO has
  no intuitive way to know the difference between "Audiences," "Visitors,"
  and "Recommendations" — they're three different views onto the same
  question ("who's arriving, and what should they see").
- **Raw internal enum values render directly in the UI.** Example:
  `src/components/sites/site-detail.tsx:79` prints the literal `elementType`
  string (`HEADLINE`, `CTA_LABEL`, `SUBHEADLINE`) instead of a human label.
- **No single screen answers the CMO's actual question**: is this working,
  how much lift, what needs my attention today. Overview exists but the
  powerful proof points (significance verdicts, underperformance alerts) live
  on a separate Analytics page a new user has no reason to find.
- **The "automatic" pieces are disconnected, manual-trigger flows.**
  Accepting a Recommendation only creates an Audience — a human still has to
  separately click "Generate experience," then separately approve every
  individual rule it produces. There is no single "optimize my site" action.
- **Jargon throughout**: "personalization boundary," "GeneratedExperience,"
  "ContentElement" are internal-model names that leak into copy and mental
  model, not translated into what a marketer is actually deciding.

---

## 4. The tension this request surfaces — flagging, not silently resolving

"Automatically generate CRO optimization and personalization" is in real
tension with a non-negotiable rule this codebase already enforces
(`CLAUDE.md`: *"Every personalizable element has a default... nothing goes
live unapproved"*) and with the still-open legal question in
`docs/decisions.md` D5 — AI-modified content shown on a *third party's* live
site, in their name, with real liability questions never resolved.

**This document does not resolve that tension by quietly removing the
approval gate.** The recommended design (§5C) mirrors how Dynamic Yield's own
Predictive Targeting actually works: automation happens *inside* guardrails a
human already set (statistical significance, brand-safety pass, an
audience/element the customer already allowed AI to touch) — not an AI
freely publishing whatever it wants. "Automatic" should mean *the human stops
being the bottleneck for routine, low-risk decisions*, not *the human is
removed from the loop entirely*. This is a real decision point — see §7.

---

## 5. The plan

### A. Information architecture: collapse nine concepts into three

Replace the current nav with something a CMO recognizes on sight:

1. **Home** — one screen: is personalization live, what changed this week,
   what needs a decision today (pending approvals, underperformance alerts).
   Replaces today's Overview.
2. **Experiences** — the single home for "who sees what and why." Merges
   today's Audiences + Recommendations + the generate/approve flow into one
   place: see active segments, AI-drafted experiences awaiting review, and
   live experiences with their real lift number, in one list. Visitors stays
   reachable from here (an audience is built from real visitor data), not as
   a disconnected top-level page.
3. **Site & Setup** — the connected website, its understanding report,
   personalization boundaries, and the embed snippet. Merges today's Sites +
   Integrations + the personalization-boundary settings currently buried in
   Settings.

Analytics stays visible but becomes a tab inside Experiences (the lift number
belongs next to the experience that produced it, not in a separate silo).
Settings shrinks to account/billing/team — not feature configuration.

Every user-facing label gets a pass to remove raw enum leakage
(`HEADLINE` → "Headline," `CTA_LABEL` → "Button text") — mechanical, low-risk,
high-visibility fix.

### B. Onboarding: actually build product-spec.md §15 as written

The spec already describes the right flow (`docs/product-spec.md` §15): URL
→ scan progress → plain-English understanding report → optional data
sources → one switch to turn personalization on. Audit the current signup →
first-site flow against this exactly and close whatever gap remains — this
is verification-and-polish work, not new invention, since Phase 1's crawl
and understanding report already exist.

### C. The Auto-Optimize loop — the actual "automatic CRO" feature

This is the core new work. Wire existing, already-verified pieces into one
continuous, named loop instead of four disconnected manual flows:

```
Recommendations detects a real segment opportunity
        ↓
generateExperience drafts AI copy for that segment
        ↓
Two-layer brand-safety check (already built, D4)
        ↓
Goes live only inside an A/B holdout (already built) —
never 100% of traffic on an unproven variant
        ↓
Statistical significance test runs continuously (already built)
        ↓
   significant win  →  auto-promote to full traffic
   significant loss →  auto-revert, notify the CMO why
   not enough data  →  keep collecting, no action
```

One new site-level control: **"Auto-optimize"**, off by default. Three modes,
not two, to keep the approval gate real:

- **Off** (today's behavior — everything manual, human approves every rule)
- **Auto-draft** (default once enabled): AI drafts and tests automatically,
  but a human still approves before a winning variant gets full traffic —
  this is the safe default that actually solves "clanky," since the CMO's
  job shrinks from "build a segment, write a rule, run generateExperience,
  approve every line" to "review what the AI already tested and pick a
  winner."
- **Auto-promote** (opt-in, explicit, per-site): statistically significant
  winners go live automatically without a per-variant click — this is the
  literal "automatic" the request asks for, but scoped to variants that
  already passed brand-safety *and* a real statistical test, never a raw AI
  output going straight to production.

This is additive, not a rewrite: `generateExperience`, the holdout hash,
the significance test, and the underperformance alert all already exist and
are already tested. The new work is the orchestration loop and the
three-mode toggle, not new AI or new statistics.

### D. In-context visual review (the WYSIWYG gap)

Evolve Live View from a separate simulator into an inline reviewer: open the
real site preview, click any personalized element directly on the page, see
its variants per audience right there — replacing the current jargon-heavy
diff-table review screen. This is Dynamify's answer to Dynamic Yield's
visual editor, adapted to the "we don't let you edit design, only content"
constraint that's core to the product (`docs/product-spec.md` §2).

### E. Proof, in CMO language

Analytics already computes real generic-vs-personalized lift with a real
significance verdict (Hardening, 2026-08-28). The work here is presentation,
not engineering: lead with "+41% conversion on your Enterprise segment,
95% confidence" in the Experiences view, not a separate stats page a new
user has no reason to visit.

### F. Explicit non-goals for this launch

State these plainly so nobody mistakes silence for "eventually, sure":

- No email/SMS/app orchestration — website-only remains the core promise.
- No embedded CDP or ad-platform audience sync — `product-spec.md` already
  rules out being a CRM; this would be a different product.
- No conversational/chatbot AI layer — explicitly ruled out in the spec.
- No live ecommerce platform adapters (Shopify, etc.) — `docs/ecommerce.md`
  stays foundation-only; product recommendations need real commerce data
  this launch doesn't have.
- No multi-armed bandit testing — fixed holdout + significance testing is
  good enough for launch; bandits are real v2 work, not a blocker.

### G. The hard gate: legal review before real customer traffic

Independent of feature completeness. `docs/decisions.md` D5 is still
explicitly open: who's liable if AI-generated copy makes a claim the
customer wouldn't stand behind, what a customer needs to represent/warrant
when they enable this, and the GDPR/CCPA exposure of visitor tracking by
jurisdiction. This has been flagged since Phase 3 and never resolved — it
should block "launch to real, unaffiliated customers," not just get
carried forward as another footnote.

---

## 6. Why the non-goals matter as much as the goals

Dynamic Yield's breadth is the product of a much larger, older, differently-
funded platform. Matching it feature-for-feature before launch would mean
building a CDP, an omnichannel orchestration layer, and a commerce
recommendations engine — each roughly its own product — before shipping
anything. The part of Dynamic Yield that's actually reachable and actually
solves "clanky, not automatic enough" is narrower: connect the automation
Dynamify already half-has, and stop showing the customer the database
schema. That's what §5 is scoped to.

---

## 7. Decisions needed before this becomes roadmap truth

Per this project's own convention (`docs/decisions.md`) — flagging rather
than silently picking:

1. **Auto-promote, at launch or after?** §5C's three-mode design lets
   "Auto-draft" ship first (safe, still solves the manual-toil complaint)
   with "Auto-promote" following once there's real customer trust. Default
   recommendation: ship Auto-draft only at launch; Auto-promote is a fast
   follow once at least one real site has run the loop successfully.
2. **Does "implement their features" mean matching Dynamic Yield's full
   breadth**, including the explicitly-rejected items in §5F, or does the
   product intentionally stay narrower? This plan assumes the latter,
   consistent with `docs/product-spec.md`'s own stated boundaries — but it's
   a real fork worth confirming explicitly rather than assuming.
3. **Sequencing**: IA/nav collapse (§5A) is the cheapest, highest-visibility
   fix and could ship independently of the Auto-Optimize loop. Recommend
   doing it first — it directly answers "clanky and unclear" in days, not
   weeks, while the loop (the larger build) is in progress.
4. **D5's legal review** — who owns getting this done, and does it block
   onboarding new (non-test) customers specifically, or all real traffic
   including the team's own dogfooding site?
