# Conversational agent

**Status: specification only. Do not implement before Gate 4 passes and Phase 3
is complete.** This is a new product surface with its own failure modes, not a
feature bolted onto the page renderer.

---

## Why this exists

Not to deflect support tickets. The agent's job is to move a visitor toward one
of three outcomes: **book a call, buy, or capture a lead.** Everything else it
does is in service of that or is out of scope.

The differentiator is that it is **personalization-aware**. By the time a visitor
opens the widget, the engine has already resolved them into an audience. The
agent inherits that resolution: same audience, same register, same offer. An
enterprise visitor's agent leads with security posture and routes to sales; a
price-sensitive shopper's agent answers about shipping thresholds and returns.

If the agent contradicts the page, the product is broken. Treat consistency
between page and agent as a correctness property, not a nice-to-have.

---

## Architecture

```
Visitor context (already resolved by engine)
  → agent session (audience, page, catalogue scope)
  → retrieval over merchant-approved content
  → LLM with tool access
  → structured response: message + optional action
```

The agent is a **consumer** of the personalization engine, never a second copy of
it. It reads the resolved audience; it does not evaluate rules itself.

Session state lives server-side, keyed by an opaque session ID. Never trust
client-supplied audience, org, or product identifiers — re-resolve everything
from the session.

---

## The three actions

The agent's output is a message plus at most one **action**, rendered as an
explicit UI element the visitor taps. The model never fabricates a link, a price,
or a booking slot; it selects from actions the server has authorised for this
session.

**`book_call`** — renders a scheduling embed. Only offered when the resolved
audience is sales-eligible. Passing captured context into the booking (company,
topic discussed) is the point; a call booked with no context is worth much less.

**`buy`** — renders add-to-cart or checkout. Price, variant, and stock come from
a live tool call against the platform, never from the model's memory or from
retrieved text. If the tool call fails, the action is not offered.

**`capture_lead`** — an inline form, not a conversational interrogation. Asking
for an email mid-sentence reads as a trap.

Actions are **proposed, never auto-executed.** The agent does not add to cart, do
not book, and does not submit a form on the visitor's behalf.

---

## Grounding and honesty

The agent answers from merchant-approved sources only: published page content,
product catalogue, an uploaded FAQ, and policy documents. Retrieval-augmented,
with the retrieved passages passed as context.

**Hard rules:**

- Price, stock, shipping cost, and delivery estimates come from live tool calls.
  Never from the model, never from cached text. A wrong price is a consumer-law
  problem for the merchant, not an embarrassing bug for us.
- Never state a policy the merchant hasn't published. Returns, warranty, refunds,
  data handling — quote the source or say the agent doesn't know.
- Refuse to guess. "I don't have that — here's how to reach someone who does" is
  a correct answer and should be trained for, not treated as failure.
- Never make commitments on the merchant's behalf: no discounts, no exceptions,
  no promises about delivery dates, no negotiating.
- Never claim to be human. If asked directly, say plainly that it's an AI agent.

Every response logs which sources it drew on. Merchants must be able to audit why
the agent said something.

---

## Escalation

The agent hands off — and stops trying to help — when:

- The visitor asks twice about something it can't answer
- The topic is a complaint, a refund dispute, or an order problem
- The visitor expresses frustration
- The conversation touches anything legal, medical, financial, or safety-related
- The visitor asks to speak to a person, at any point, no friction

Handoff means: a real route (email, form, scheduler, live chat if the merchant
has one), the conversation transcript attached, and no further attempts to
resolve. A bot that will not let go is worse than no bot.

---

## Security

**The agent is the largest untrusted-input surface in the product.** Everything
the visitor types is untrusted, and so is everything retrieved from merchant
content — a merchant's own product description could contain injected
instructions, whether maliciously or from a scraped supplier feed.

- Visitor input and retrieved content are **data, never instruction**. Structural
  separation, not a prompt telling the model to ignore instructions.
- System prompt, tool definitions, and internal identifiers never appear in
  output. Assume visitors will try to extract them; test for it.
- Tools are narrow and typed. No arbitrary SQL, no shell, no arbitrary HTTP. Each
  tool validates its own arguments and re-checks authorisation server-side.
- Tools are scoped to the session's organisation and, for ecommerce, to that
  merchant's catalogue. Cross-tenant retrieval is the worst possible bug here.
- All agent output rendered in the widget is sanitised. Model output is a
  potential XSS vector like any other user-influenced string.
- Rate limit per session and per IP. Cap tokens per session and per org per day —
  the agent is the only part of the product where a single visitor can generate
  unbounded cost.
- Never echo back captured personal data in a way that persists in logs.

---

## Privacy

Say at the start of the conversation that it's an AI agent and that the
conversation is recorded. Once, briefly, not as a modal.

Collect only what the outcome requires. Do not ask for personal information the
merchant has no use for. Transcripts are personal data: retention limits,
deletion on request, export on request, and covered by the same processor
obligations as the rest of the platform.

Never infer or record sensitive categories — health, finances, politics,
anything in that family — even if the visitor volunteers it. If a visitor's
message contains it, don't persist it.

---

## Performance and behaviour

- Widget under 15KB, loaded lazily on interaction, never on page load. It must
  not touch the page's Core Web Vitals.
- Stream responses. First token under 1s.
- If the agent is unavailable, the widget doesn't render. The page is unaffected.
  Same degradation principle as the rest of the product.
- Never open automatically on load. An unprompted popup is the single most
  common reason visitors dismiss chat widgets permanently.
- Merchant controls: which pages, which audiences, which actions, what hours.

---

## Measurement

The agent is a conversion surface and must be measured as one, honestly.

Track: sessions, messages per session, action offered, action taken, escalations,
unanswered questions, and — the important one — **conversion rate of visitors who
engaged versus comparable visitors who didn't.**

That comparison is confounded: people who open a chat widget are already more
engaged. Do not report it as causal lift without a holdout. Build the holdout in
from the start; retrofitting it is impossible.

Surface the unanswered-question list prominently to merchants. It is the most
useful output the agent produces, independent of any conversion it drives.

---

## Open questions

- Which model, and does it change per tier? Latency and cost trade directly
  against answer quality, and the margin at €149/month is thin.
- Do we let merchants edit the agent's persona? Flexibility invites merchants
  writing prompts that break the grounding rules above.
- How does the agent behave for a visitor who matched no audience — roughly a
  fifth of traffic? Defaults, presumably, but the register question is open.
- Multilingual: does it answer in the visitor's language even when merchant
  content is English-only? Translating policy text is a liability.
