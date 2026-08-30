# Visitor data capture & CRM export

**Status: specification. Implement in Phase 3 (tracking) and Phase 6 (CRM).**

Claude: the constraints in this document are legal and architectural, not
preferences. Do not relax one to satisfy a feature request. If a task appears to
require something listed under "Never capture", stop and raise it.

---

## The design principle

The instinct is to capture everything possible. That is the wrong goal, and under
GDPR it is also unlawful — data minimisation (Art. 5(1)(c)) requires collecting
only what is necessary for a stated purpose.

Our purpose is narrow: **decide which variant a visitor should see, and measure
whether it worked.** Almost everything needed for that is segment-level, not
person-level. We do not need to know who someone is. We need to know which
audience they fall into.

Capturing more than that increases legal exposure, breaks enterprise procurement,
and adds nothing to variant selection.

---

## Two tiers of identity

Keep these strictly separate in the schema, the UI, and the export.

**Company-level (default, always on).**
IP resolved to an organisation. Under GDPR this is far easier to justify under
legitimate interest, and match rates are higher and more reliable than
person-level (roughly 25–40% vs 10–20% on B2B traffic). Note that the IP address
itself is still personal data under GDPR — a lawful basis, disclosure, and
documentation are still required. Resolve, use, discard; do not store raw IPs
beyond what is needed for the lookup.

**Person-level (only when volunteered).**
Name and email exist only when the visitor gives them to us: a form submission,
an account login, an authenticated session, an email-campaign click carrying a
first-party identifier the merchant already holds lawfully.

**Never** purchase, infer, or match person-level identity from an identity graph.
Person-level identification of anonymous EU visitors requires explicit consent in
practice, its legitimate-interest justification is untested in enforcement, and
the major vendors in that space (e.g. RB2B) structurally do not serve EU, UK or
APAC traffic at all. For a Finland-based company selling into the EU this is
exposure with no upside — and a number of enterprise buyers block person-level
tools by policy even where they are legal.

Positioning consequence: **"we never deanonymise individuals" is a selling
point.** Say it on the pricing page.

---

## What we capture

### Always (no consent needed — strictly necessary, no cross-site tracking)

- Page URL, path, referrer host
- UTM parameters (source, medium, campaign, term, content)
- Device class, viewport, browser family, OS family — coarse buckets only
- Language from `Accept-Language`
- Country and region from edge geo headers (never a third-party geo API on the
  critical path)
- Timestamp
- Resolved audience, matched rule ID, variant ID served

That last line is the one people forget and it is the most valuable data we hold:
**what each visitor was actually shown.** Without it, no analysis is possible and
no support question is answerable.

### With consent (non-essential, requires opt-in under ePrivacy/PECR)

- Persistent visitor ID (first-party cookie)
- Returning status, session count, days since last visit
- Session history: pages viewed, scroll depth, time on page, CTA clicks
- Product views, cart events, catalogue categories browsed (ecommerce)
- Prior conversions

### Only when volunteered

- Email, name, phone — from forms or authenticated sessions
- Company name, size, industry — from enrichment on a **domain the visitor
  supplied**, or from the merchant's own CRM record

### Never capture

- Person-level identity resolved from an identity graph
- Precise geolocation, raw IP retained at rest, device fingerprints
- Anything special-category under Art. 9: health, biometrics, sexual
  orientation, religion, ethnicity, political opinion, trade union membership —
  including anything **inferred** that lands in these categories. Inferring
  pregnancy from browsing behaviour is a health inference.
- Keystrokes, session replay, clipboard, form field contents before submission
- Cross-site behaviour, or any data from other merchants' properties

---

## Consent architecture

Consent state is an **input to the engine**, not a wrapper around it.

```
consent = { necessary: true, analytics: bool, personalization: bool }
```

The engine receives the consent object alongside the context and silently drops
any attribute the visitor hasn't permitted. A rule depending on a dropped
attribute simply doesn't match, and the default is served. **This is why every
element needs a default** — without consent, roughly a fifth of traffic runs on
defaults alone.

Integrate with the merchant's existing CMP rather than shipping our own banner.
Support Google Consent Mode v2 and IAB TCF signals. Merchants already have a
banner; a second one is a support ticket.

Default posture before any consent signal: necessary only. No persistent ID, no
history, session-scoped in-memory context only.

---

## Schema

```
Visitor          id, org_id, first_seen, last_seen, session_count,
                 consent_state, company_id?, identified_person_id?
Company          id, org_id, domain, name, size_band, industry, source,
                 resolved_at
Person           id, org_id, email, name, source (form|auth|crm), consented_at
Session          id, visitor_id, started_at, referrer, utm_*, device, geo_country,
                 geo_region
Event            id, session_id, type, occurred_at, page_path, metadata jsonb
Impression       id, session_id, page_version_id, audience_id, rule_id,
                 variant_id, occurred_at
Conversion       id, session_id, goal_id, value, currency, occurred_at
```

`Person` is nullable and usually null. That's correct, not a gap.

Every table carries `org_id`, and every query filters on it from the session.
Index `(org_id, occurred_at)` on the event tables — they will be the largest
objects in the database by an order of magnitude.

Store metadata as a constrained jsonb with a validated schema, not a free-for-all.
Unvalidated event metadata is how PII ends up in a column nobody can audit.

---

## Ingestion endpoint

One `POST /collect`. Requirements:

- Zod-validate every field; reject unknown keys rather than storing them
- Rate limit per IP and per site key; this is the most abusable endpoint we run
- Never trust `org_id` from the client — derive it from the site key
- Return 204 fast; queue for processing. Never block page rendering.
- Use `sendBeacon` client-side so navigation isn't delayed
- Drop malformed events silently rather than erroring into the visitor's console
- Detect crawler user agents and skip event recording — but **still serve them
  identical HTML**. Suppressing analytics for bots is fine; serving them
  different content is cloaking.

---

## Retention

- Raw events: 13 months, then aggregate and delete
- Session detail: 90 days
- Visitor profiles: 24 months from last activity, then delete
- Aggregates: indefinite (no personal data)
- Raw IP: never persisted; resolved to country/company in memory and discarded

Make retention windows configurable per organisation, with our defaults as the
maximum, not the minimum. Enterprise buyers will ask for shorter.

---

## Data subject rights

Build these in Phase 3, not when the first request arrives.

- Export: all data for a visitor ID or email, machine-readable, within 30 days
- Delete: hard delete across all tables, cascading, including the queue
- Rectify: correct person-level fields
- Object: stop processing, retain nothing further

Expose them as API endpoints and as buttons in the merchant dashboard. **We are a
processor; the merchant is the controller.** They receive the request, we must
let them action it in minutes. Ship a DPA and maintain a public sub-processor
list before the first paying customer.

---

## CRM export

### What to sync

Sync **segment and behaviour**, not raw event streams. A CRM full of pageview
records is unusable and expensive. Push:

- Company: domain, name, size band, industry, first/last seen
- Engagement: sessions, pages viewed, days active, last visit
- Personalization: which audience matched, which variants were seen, which
  converted — this is the differentiated payload nobody else can send
- Conversions: goal, value, timestamp
- Person: only where volunteered, only with a recorded lawful basis

The variant history is the interesting part. A sales rep seeing "this account saw
the enterprise security messaging three times and converted on the DPA download"
has something no other tool gives them.

### Design

- Field mapping UI: our fields → their object properties. Never hard-code an
  assumed CRM schema.
- Two-way where the CRM allows it: read customer status, plan, and lifecycle
  stage back in as personalization attributes. This closes the loop and is the
  main reason merchants connect a CRM at all.
- Idempotent upserts keyed on domain (company) or email (person). Never create
  duplicates; CRM hygiene damage is unforgivable to a RevOps owner.
- Batch and rate-limit against each provider's published limits; back off rather
  than getting the merchant throttled.
- Queue with retries and a dead-letter path. Surface sync failures in the UI —
  silent failure is worse than no integration.
- Never sync a person without a recorded lawful basis and its source.

### Order

HubSpot first (largest self-serve mid-market base, good API, our ICP lives
there). Then Salesforce. Then Klaviyo and Shopify Customers for ecommerce, where
the buyer is different. Segment/CDP last — it's an enterprise ask.

Also ship a plain CSV export and a webhook. Some merchants want the data
somewhere we haven't integrated, and a webhook costs a day.

---

## Security

- Site keys are public and identify an org — they are not secrets. Bind them to
  allowed domains server-side.
- CRM OAuth tokens: encrypted at rest, org-scoped, never exposed to any client,
  minimum scopes.
- Validate signatures on all inbound CRM webhooks.
- Never log emails, tokens, raw IPs, or full event payloads.
- Audit-log every export, CRM connection, and deletion. Enterprise buyers will
  ask to see this.

---

## Open questions

- Do we hold person-level data at all, or only pass it through to the merchant's
  CRM? Not storing it is a materially stronger compliance and sales position and
  costs us little.
- Attribution conflict: GA4, the platform's own analytics, and us will all report
  different numbers. Decide how we present that before merchants discover it.
- Is company-level enrichment first-party or a third-party provider? A provider
  becomes a sub-processor and must appear on the public list.

---

None of this is legal advice. Before launch, have Finnish/EU counsel review the
consent model, the legitimate-interest assessment for IP-to-company resolution,
and the DPA. Budget for it — it is cheaper than the alternative and it is a
prerequisite for enterprise deals.
