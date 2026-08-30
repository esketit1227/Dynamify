# Autonomy design

**Supersedes the blanket "AI never publishes without approval" rule in
CLAUDE.md.** That rule was right about generation and wrong about allocation.
The revised rule is below.

Goal: plug in, system learns, applies changes, notifies, conversions rise.
Minimal human work. This document is about how to get there without shipping
something that damages a customer's business.

---

## The distinction everything rests on

**Allocation** — deciding which already-approved variant a given visitor gets.
Bounded: every possible outcome is something the merchant already signed off. The
worst case is a suboptimal choice from a safe set. **Fully autonomous, always.**

**Generation** — creating new content that makes claims about the merchant's
product. Unbounded: the model can say something false, off-brand, or unlawful,
and the merchant is accountable for it. **Never autonomous by default.**

Founders conflate these because both are "AI doing things." They are different
actions with different blast radii. Automate the first completely. Gate the
second, and open the gate only where the content type makes falsehood
structurally impossible.

**Revised rule for CLAUDE.md:**
> The system autonomously allocates traffic among approved variants. It never
> publishes generated content that makes a factual or promotional claim without
> explicit human approval. Reordering, selection, and ranking of existing
> approved assets is allocation, not generation.

---

## What can be fully autonomous, day one

**Traffic allocation.** Contextual multi-armed bandit per segment. Shift traffic
toward what converts, continuously, with no human in the loop. Well-understood
statistics, not research.

**Reordering existing assets.** Which approved image leads, which real review
surfaces, which real testimonial shows, which real product ranks first, which
section comes before which. Nothing new is created; only order changes. All of
this is allocation.

**Losing-variant suspension.** If a variant underperforms the default with
reasonable confidence, stop serving it and notify. Removing something is safer
than adding something.

**Audience discovery.** Cluster visitors by behaviour and outcome, and surface
segments the merchant never defined. Proposing a segment makes no claim about the
product, so it can be auto-created — though rules built on it that require new
copy still need the generation gate.

**Reallocation across pages.** If a rule works on one page, apply it to
structurally similar pages. Same variants, wider application.

---

## What needs a gate, and why

**Any generated copy making a factual or promotional claim.** Headlines,
subheads, benefit statements, feature descriptions, comparisons. The model does
not know the merchant's product, roadmap, or legal constraints. It will
confidently write "the fastest platform on the market" for a company that cannot
substantiate it — in the EU that is an unsubstantiated superiority claim under
the UCPD, and the merchant carries the liability.

**Anything touching price, discount, urgency, or scarcity.** The EU Omnibus
Directive specifically targets fake urgency and misleading reference pricing,
with real enforcement. Never generate these, autonomously or otherwise.

**Anything on a page with regulatory exposure.** Financial services, health,
supplements, children's products. Ship a per-page "no autonomous changes" flag
and let merchants set it.

---

## Earning autonomy: the trust ladder

Autonomy should be a dial that opens as the system proves itself *for that
merchant*, not a setting they toggle blind on day one.

**Level 0 — Observe (weeks 1–2).** System runs, learns, changes nothing. Produces
a report: here are the segments in your traffic, here's where they diverge,
here's what I'd try. Merchant sees the reasoning before granting any power.

**Level 1 — Allocate.** Autonomous traffic allocation among variants the merchant
created. No generation. Most merchants will sit here happily for months.

**Level 2 — Reorder.** Add autonomous reordering of existing approved assets:
images, reviews, products, sections.

**Level 3 — Propose.** System generates variants and queues them. One-click
approve, batch approve, or approve-by-category. This is where "minimal approving"
actually lives — not zero approvals, but ten seconds a week instead of an hour.

**Level 4 — Publish within bounds.** For merchants who opt in explicitly:
generated variants go live automatically, but only within constraints the
merchant set once — an approved claims list, a banned-words list, a tone
reference, a maximum divergence from the default, and no price/urgency language.
Every publish is logged, reversible, and notified.

Level 4 should be earned: offered only after a merchant has approved, say, 20+
generated variants with a high acceptance rate. If they reject a third of what
you generate, they are not ready and neither are you.

**The instant-reversal requirement.** At Level 4, one click reverts every
autonomous change made in a chosen window. Not a support ticket — a button. If
this doesn't exist, Level 4 doesn't ship.

---

## The constraint nobody in this category admits

**Bandits need traffic. Most of your customers won't have it.**

A merchant with 5,000 sessions/month, split across four segments and three
variants, is putting a few hundred sessions behind each arm. At a 2% conversion
rate that is a handful of conversions per cell per month. The algorithm cannot
distinguish a real 15% lift from noise at that volume — not in a month, possibly
not in a quarter.

This is the central engineering problem of the autonomous version, and pretending
otherwise produces a system that confidently reallocates traffic based on random
variation, tells the merchant it improved things, and is wrong.

**Mitigations, in order of value:**

*Pool across merchants for priors, never for content.* Learn structural patterns
— "cart-abandoner segments respond to friction removal", "enterprise segments
respond to compliance proof" — and use them as Bayesian priors for a new
merchant's cold start. Never share a merchant's content, data, or results with
another. This is the one genuine network effect available to you and it
compounds: every merchant makes the next one's cold start shorter.

*Optimise leading indicators.* CTA clicks, scroll depth, and add-to-cart happen
10–50x more often than purchases. Optimise those short-term, validate against
conversion over a longer window. Watch for the failure mode: a variant that wins
on clicks and loses on purchases.

*Hierarchical models.* Share statistical strength across segments within a
merchant, so a small segment borrows from the account-level effect rather than
learning alone.

*Refuse to act below threshold.* Define a minimum sample per arm. Below it, serve
the default and say so: "not enough traffic yet to call this — I'm still
watching." **A system that admits uncertainty is more valuable than one that
guesses**, and merchants forgive slowness far more readily than confident errors.

Consider making traffic volume a qualification criterion. Below roughly 10,000
monthly sessions, the autonomous product cannot deliver, and selling it to those
merchants produces churn and bad word of mouth.

---

## What "notifies user" should actually mean

The weekly digest is the product surface for an autonomous system. It is the only
time most merchants will think about you, so it carries the whole relationship.

Include: what changed and why, in plain language; what it did to conversion, with
honest confidence language; what was tried and abandoned; what's queued for
approval; and one thing the system doesn't know and would like clarified.

That last item matters. It keeps the merchant lightly engaged, produces the
context the system needs, and makes the thing feel like a colleague rather than
a black box.

**Never report a result as proven when it isn't.** "Enterprise variant is ahead
by ~12%, but I'd want another two weeks before trusting it" builds more trust
than a fabricated significance claim, and it is the difference between a tool a
merchant relies on and one they quietly stop reading.

---

## Explainability is not optional here

The more autonomous the system, the more the engine's determinism matters. When
a merchant asks "why did you change my homepage on Tuesday", there must be an
answer: this rule, this priority, this evidence, this confidence, this many
sessions.

An autonomous system that cannot explain itself is one bad week from being
uninstalled. Keep a full decision log: every autonomous change, its trigger, the
data behind it, and a one-click revert.

---

## Where the moat is

Not the copy generation — that is an API call anyone can make.

The defensible asset is **the accumulated understanding of which personalization
patterns work for which business shapes**, learned across every merchant and
applied as priors to the next one. A new merchant plugged in on day one benefits
from every merchant before them, without a byte of their data being shared.

That is the thing that gets better with scale, and it is the reason to build the
autonomous version rather than the manual one.
