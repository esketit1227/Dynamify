/**
 * Dynamify embed script — Phases 2–6 (docs/roadmap.md), plus the
 * docs/visitor-data.md consent architecture.
 *
 * Consent is an input, not a wrapper: `window.dynamify.consent`
 * defaults to `{necessary:true, analytics:false, personalization:false}`
 * until a merchant's own CMP calls `window.dynamify.setConsent({...})` —
 * this script never ships its own banner. `analytics` gates whether any
 * event (even anonymous) is recorded and whether the visitor-identity
 * cookie is read/set at all; `personalization` gates whether the server
 * uses IP-enrichment/visitor-history attributes to decide what to show.
 * Neither ever blocks this script from running — the default is that
 * roughly a fifth of traffic runs on defaults alone (docs/visitor-data.md).
 *
 * For each crawled content element: verify the live DOM still matches what
 * was crawled (D2/D3, docs/decisions.md), then — since Phase 3 — if an
 * APPROVED personalization applies to this visitor, apply it. A verified
 * mismatch is never swapped, no matter what the server suggests; the
 * verify step is the actual safety boundary here, not just a formality.
 * Since Phase 5, it also fires one anonymous page-view beacon per load —
 * the raw material for traffic/segment recommendations. Since Phase 6, it
 * also fires a beacon on every verified CTA click — the raw material for
 * generic-vs-personalized conversion reporting (D7, docs/decisions.md).
 *
 * Anonymous by default. A site can separately opt into real, persistent
 * visitor identity (D5, docs/decisions.md, widened and decided — a
 * deliberate reversal of the anonymous-only posture above, not a silent
 * one): when — and only when — the server reports this site has that
 * turned on, this script sets a first-party `dynamify_vid` cookie and
 * sends it along with every event. Off by default, per site: most
 * installs never set this cookie at all. See getOrSetVisitorId below.
 *
 * A *returning* tracked visitor's existing cookie (never a freshly minted
 * one — see getExistingVisitorId) is also sent on the elements request
 * itself, not just on events: the server uses it to fold that visitor's
 * real, accumulated intent/stage (src/lib/visitors/inferProfile.ts) into
 * this load's personalization decision, the same way IP-based company
 * enrichment already does. A brand-new visitor has no history yet, so
 * this is a no-op on a first visit regardless.
 *
 * Every load also generates a loadToken — a fresh id, in-memory only,
 * never a cookie — sent on both the elements request and every event this
 * load fires. It has one job: on a site running an A/B holdout experiment
 * (src/lib/experiments/holdout.ts), it's the coin-flip seed for a visitor
 * with no dynamify_vid cookie, so an anonymous visit's "was this held
 * back to the default" decision stays consistent between the request that
 * decided what to show and the request that records what happened,
 * without persisting any new identifier across page loads.
 *
 * Deliberately plain, dependency-free, unminified JavaScript rather than a
 * TypeScript/bundler build artifact: this file runs on a customer's own
 * live website, and being trivially view-source-able is a trust property
 * of this product, not just a simplification.
 *
 * Never throws, never blocks the host page. Any failure (network, CORS,
 * a malformed selector) is caught and just means that element is skipped
 * — the original page is exactly what's served if anything here fails.
 *
 * Visitor-context detection is deliberately narrow: only signals readable
 * directly from the page itself (device via viewport, referrer, UTM
 * params) — no geo or custom attributes here (Live View can still
 * simulate those); a persistent identifier exists only via the opt-in
 * cookie described above, never inferred from IP or fingerprinting.
 */
(function () {
  "use strict";

  var API_BASE = "https://dynamify.example"; // overridable via data-api-base for local/dev use

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function liveContent(node, elementType) {
    if (elementType === "IMAGE" || elementType === "LOGO") return node.getAttribute("src");
    if (elementType === "CTA_HREF") return node.getAttribute("href");
    return node.textContent;
  }

  function applySwap(node, elementType, text) {
    if (elementType === "IMAGE" || elementType === "LOGO") {
      node.setAttribute("src", text);
    } else if (elementType === "CTA_HREF") {
      node.setAttribute("href", text);
    } else {
      node.textContent = text;
    }
  }

  // Exact match only, same as the server-side implementation
  // (src/lib/liveview/renderPreview.ts) — a missed check is invisible, a
  // wrong one breaks the customer's site, so this never guesses. Only a
  // verified element is ever eligible for the swap below.
  //
  // Returns the live `node` too (only when matched) — Phase 6 needs it
  // to attach CTA click tracking to the exact node that was just
  // verified, rather than re-querying the DOM a second time.
  function verify(element, debug) {
    var nodes;
    try {
      nodes = document.querySelectorAll(element.selector);
    } catch {
      return { id: element.id, matched: false, applied: false, node: null };
    }
    if (nodes.length !== 1) return { id: element.id, matched: false, applied: false, node: null };

    var node = nodes[0];
    var live = liveContent(node, element.elementType);
    var matched = live != null && normalizeText(live) === normalizeText(element.currentContent);

    var applied = false;
    if (matched && typeof element.personalizedContent === "string") {
      applySwap(node, element.elementType, element.personalizedContent);
      applied = true;
    }

    if (debug) highlight(node, matched, applied);
    return { id: element.id, matched: matched, applied: applied, node: matched ? node : null };
  }

  function highlight(node, matched, applied) {
    var color = applied ? "#2563eb" : matched ? "#16a34a" : "#dc2626";
    node.style.outline = "2px solid " + color;
    node.style.outlineOffset = "2px";
  }

  function showDebugBadge(results) {
    var matchedCount = 0;
    var appliedCount = 0;
    for (var i = 0; i < results.length; i++) {
      if (results[i].matched) matchedCount++;
      if (results[i].applied) appliedCount++;
    }
    var badge = document.createElement("div");
    badge.textContent = matchedCount + "/" + results.length + " matched, " + appliedCount + " personalized";
    badge.setAttribute(
      "style",
      "position:fixed;bottom:16px;right:16px;z-index:2147483647;" +
        "background:#111;color:#fff;font:12px system-ui,sans-serif;" +
        "padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);",
    );
    document.body.appendChild(badge);
  }

  function detectDevice() {
    var width = window.innerWidth;
    if (width < 640) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }

  // The one visitor-context detector, shared by the elements lookup and
  // the page-view beacon below — same narrow, page-native signal set
  // described at the top of this file (device/referrer/UTM only).
  function detectContext(pageUrl) {
    var utm = {};
    var utmMap = {
      utm_source: "source",
      utm_medium: "medium",
      utm_campaign: "campaign",
      utm_term: "term",
      utm_content: "content",
    };
    var hasUtm = false;
    for (var utmKey in utmMap) {
      var value = pageUrl.searchParams.get(utmKey);
      if (value) {
        utm[utmMap[utmKey]] = value;
        hasUtm = true;
      }
    }
    return {
      device: detectDevice(),
      referrer: document.referrer || undefined,
      utm: hasUtm ? utm : undefined,
    };
  }

  // docs/visitor-data.md's Consent architecture: "an input to the
  // engine, not a wrapper around it." Defaults to necessary-only until a
  // merchant's own CMP (OneTrust, Cookiebot, a hand-rolled banner,
  // whatever they already run) reports otherwise via
  // window.dynamify.setConsent — this script never ships its own
  // banner. Read fresh at the top of run() below, not cached at parse
  // time, so a CMP that calls setConsent after this script has already
  // loaded (but before the page navigates again) still takes effect on
  // the next load this script fires.
  window.dynamify = window.dynamify || {};
  window.dynamify.consent = window.dynamify.consent || { necessary: true, analytics: false, personalization: false };
  window.dynamify.setConsent = function (state) {
    window.dynamify.consent = {
      necessary: true,
      analytics: !!(state && state.analytics),
      personalization: !!(state && state.personalization),
    };
  };

  var VISITOR_COOKIE_NAME = "dynamify_vid";
  var VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

  // Read-only, never sets anything — safe to call before we know whether
  // this site currently has tracking on (a cookie from a *prior* visit,
  // while tracking was on, is still a real returning visitor worth
  // recognizing; see run() below, which sends this on the elements
  // request itself so the visitor's own real intent/stage — not just
  // their anonymous page-native signals — can inform what they're shown
  // on this load, not only the next one).
  function getExistingVisitorId() {
    var match = document.cookie.match(new RegExp("(?:^|; )" + VISITOR_COOKIE_NAME + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Only ever called when the server has already reported this site has
  // visitor tracking on (see run() below) — never generated speculatively.
  // Reads the existing cookie if one's there; otherwise mints a random,
  // non-PII id and sets it. If cookies are blocked, the id still works for
  // this one page load's events, it just won't persist to the next visit.
  function getOrSetVisitorId() {
    var existing = getExistingVisitorId();
    if (existing) return existing;

    var id =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

    try {
      document.cookie =
        VISITOR_COOKIE_NAME + "=" + encodeURIComponent(id) + "; path=/; max-age=" + VISITOR_COOKIE_MAX_AGE + "; SameSite=Lax";
    } catch {
      // Cookies disabled/blocked — nothing to do, id just won't persist.
    }
    return id;
  }

  // One event beacon — a page view (Phase 5, the raw material for
  // traffic/segment recommendations) or a CTA click (Phase 6, the raw
  // material for generic-vs-personalized conversion reporting).
  // `visitorKey` is only ever included when the site opted into real
  // visitor tracking; anonymous by default. Fire-and-forget: keepalive
  // lets it complete even if the visitor navigates away immediately (the
  // common case right after a CTA click), and it never throws or blocks
  // the host page either way.
  function reportEvent(apiBase, siteId, pageUrl, context, type, contentElementId, visitorKey, loadToken, consent) {
    try {
      var body = { url: pageUrl.toString(), context: context, type: type, consent: consent };
      if (contentElementId) body.contentElementId = contentElementId;
      if (visitorKey) body.visitorKey = visitorKey;
      if (loadToken) body.loadToken = loadToken;
      fetch(apiBase + "/api/embed/site/" + encodeURIComponent(siteId) + "/events", {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(function () {});
    } catch {
      // Some environments don't support keepalive/fetch fully — never let
      // that surface on the host page.
    }
  }

  // Captured synchronously, at parse time — document.currentScript is only
  // valid while this script is actually executing inline; it would already
  // be null by the time a deferred DOMContentLoaded callback runs.
  var scriptTag = document.currentScript;

  function run() {
    if (!scriptTag) return;

    var siteId = scriptTag.getAttribute("data-site-id");
    if (!siteId) return;

    var apiBase = scriptTag.getAttribute("data-api-base") || API_BASE;
    var debug = /(?:^|[?&])dynamify_debug=1(?:&|$)/.test(window.location.search);

    // Strip our own debug flag before matching — it's script-internal
    // state, never something the crawl would have seen, and would
    // otherwise make every debug check spuriously fail to match anything.
    var pageUrl = new URL(window.location.href);
    pageUrl.searchParams.delete("dynamify_debug");

    var context = detectContext(pageUrl);
    // Read fresh, not cached — see the definition above.
    var consent = window.dynamify.consent;

    // In-memory only — never stored, never a cookie. See the top-of-file
    // comment for what this is for.
    var loadToken =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : "l-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

    var params = new URLSearchParams();
    params.set("url", pageUrl.toString());
    if (context.device) params.set("device", context.device);
    if (context.referrer) params.set("referrer", context.referrer);
    if (context.utm) {
      var utmParamMap = { source: "utmSource", medium: "utmMedium", campaign: "utmCampaign", term: "utmTerm", content: "utmContent" };
      for (var utmField in utmParamMap) {
        if (context.utm[utmField]) params.set(utmParamMap[utmField], context.utm[utmField]);
      }
    }
    if (consent.analytics) params.set("consentAnalytics", "1");
    if (consent.personalization) params.set("consentPersonalization", "1");
    // Only ever a *pre-existing* cookie value (never minted here) — a
    // brand-new visitor has no history to look up anyway. Gated on
    // analytics consent (docs/visitor-data.md: a persistent identifier
    // is a "with consent" capability) in addition to the server's own
    // per-site tracking gate — a stale cookie from back when both were
    // on, on a page load where either has since turned off, is simply
    // not read or sent.
    var existingVisitorId = consent.analytics ? getExistingVisitorId() : null;
    if (existingVisitorId) params.set("visitorKey", existingVisitorId);
    params.set("loadToken", loadToken);

    var endpoint = apiBase + "/api/embed/site/" + encodeURIComponent(siteId) + "/elements?" + params.toString();

    // Explicitly credential-less — this is a public endpoint by design, no
    // cookie/session of ours should ever be sent to it or expected by it.
    fetch(endpoint, { credentials: "omit" })
      .then(function (res) {
        return res.ok ? res.json() : { elements: [], visitorTrackingEnabled: false };
      })
      .then(function (data) {
        var elements = data.elements || [];
        // Only ever reads/sets the cookie when the server says this site
        // opted in *and* the visitor has given analytics consent —
        // anonymous otherwise. The page-view beacon below waits for this
        // response specifically so it can carry the right visitorKey
        // from its very first event, not just later ones.
        var visitorKey = data.visitorTrackingEnabled && consent.analytics ? getOrSetVisitorId() : undefined;
        reportEvent(apiBase, siteId, pageUrl, context, "PAGE_VIEW", undefined, visitorKey, loadToken, consent);

        var results = [];
        for (var i = 0; i < elements.length; i++) {
          var element = elements[i];
          var result = verify(element, debug);
          results.push(result);

          // Click tracking only on CTA_LABEL, not CTA_HREF — Phase 4
          // established they share one DOM node/selector (the label text
          // and its destination href live on the same link), so
          // listening on both would double-count a single click as two
          // events. CTA_LABEL is the product's own framing of "the CTA":
          // the visible, clickable thing a visitor actually acts on.
          if (result.matched && result.node && element.elementType === "CTA_LABEL") {
            (function (node, elementId) {
              node.addEventListener("click", function () {
                reportEvent(apiBase, siteId, pageUrl, context, "CTA_CLICK", elementId, visitorKey, loadToken, window.dynamify.consent);
              });
            })(result.node, element.id);
          }
        }
        window.__dynamify = { results: results };
        if (debug) showDebugBadge(results);
      })
      .catch(function () {
        // Network hiccup, blocked request, whatever — never surface an
        // error on the host page.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
