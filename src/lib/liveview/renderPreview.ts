import * as cheerio from "cheerio";
import { resolve } from "@dynamify/personalization-sdk";
import type { ResolvedPage, VisitorContext } from "@dynamify/personalization-sdk";
import { prisma } from "@/lib/db";
import { fetchPageHtml } from "@/lib/sites/crawler";
import { normalizeText } from "@/lib/sites/extract";
import { getLiveViewDefinition, CrawledPageNotFoundError } from "@/lib/liveview/service";

export type SelectorMeta = { selector: string; elementType: string; currentContent: string };

// Shared between the route's HTTP response header (when the browser loads
// this URL directly) and a <meta> tag baked into the HTML itself (when a
// caller instead fetches the body and renders it via iframe `srcDoc` — a
// meta-tag CSP is honored regardless of how the document was loaded, an
// HTTP header isn't, once it's no longer a real HTTP response the browser
// fetched itself). Every directive here is meta-tag-compatible (no
// `frame-ancestors`/`sandbox`/`report-uri`, which only work as headers).
export const PREVIEW_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:;";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// This panel is deliberately secondary (see live-view.tsx's "Compare
// against the real live site" toggle) — the primary preview
// (RenderedPreview, rendered from the same already-crawled content) never
// depends on this succeeding. A generic "couldn't load" with no reason
// reads as broken; this explains the two real causes (no live/reachable
// URL — true for any fictional demo site, or a page that blocks framing)
// and points back at the panel that *does* work, rather than leaving a
// dead end.
export function unavailableHtml(pageUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(PREVIEW_CSP)}"></head><body style="font-family:system-ui,sans-serif;color:#17171a;background:#f3f1ee;padding:2.5rem 2rem;text-align:center;">
    <div style="max-width:22rem;margin:0 auto;">
      <p style="margin:0 0 .5rem;font-size:14px;font-weight:600;">Couldn't load a live preview of this page</p>
      <p style="margin:0 0 1rem;font-size:13px;line-height:1.5;color:#6f6e6a;">
        This happens when the page isn't a real, publicly reachable URL (true for any demo/example
        site) or when it blocks being shown in a frame. The preview above is rendered from the same
        real content and reflects exactly what this visitor would see.
      </p>
      <a href="${escapeHtml(pageUrl)}" target="_blank" rel="noreferrer" style="font-size:13px;color:#17171a;">Try opening it directly ↗</a>
    </div>
  </body></html>`;
}

// The only place a crawl-time `selector` ever gets matched against live DOM
// (docs/decisions.md D2 governs the *production* embed script, not this —
// this is a one-shot authenticated preview, nothing installed on the
// customer's site). Follows D2's own posture anyway: a selector that
// doesn't match exactly one live node is skipped, never guessed, so a
// drifted/renamed element just leaves that part of the real page untouched.
// Pure and DB/network-free — unit-testable against fixed HTML fixtures,
// same reasoning as the personalization engine itself (CLAUDE.md).
export function applyPersonalizedSwaps(
  html: string,
  pageUrl: string,
  resolved: ResolvedPage,
  elementMeta: Map<string, SelectorMeta>,
): string {
  const $ = cheerio.load(html);

  for (const component of resolved.components) {
    if (!component.matchedVariantId) continue;
    const meta = elementMeta.get(component.id);
    if (!meta) continue;

    const target = $(meta.selector);
    if (target.length !== 1) continue; // ambiguous or missing on the live page — skip, don't guess

    // D2/D3 (docs/decisions.md): confirm this node still holds what was
    // crawled before trusting it's the same element — a page that changed
    // since the crawl gets skipped here, not guessed at. Exact match only.
    const liveContent =
      meta.elementType === "IMAGE" || meta.elementType === "LOGO"
        ? target.attr("src")
        : meta.elementType === "CTA_HREF"
          ? target.attr("href")
          : target.text();
    if (liveContent === undefined) continue;
    if (normalizeText(liveContent) !== normalizeText(meta.currentContent)) continue;

    const text = (component.content as { text?: unknown }).text;
    if (typeof text !== "string") continue;

    if (meta.elementType === "IMAGE" || meta.elementType === "LOGO") {
      target.attr("src", text);
    } else if (meta.elementType === "CTA_HREF") {
      target.attr("href", text);
    } else {
      target.text(text);
    }
  }

  // <base> must come first so relative URLs in the rest of <head> (and
  // beyond) resolve against the real site, not this app's own origin.
  // The CSP meta tag goes right after it — see PREVIEW_CSP's comment for
  // why this needs to be a meta tag here, not just the route's header.
  const base = `<base href="${escapeHtml(pageUrl)}"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(PREVIEW_CSP)}">`;
  const head = $("head");
  if (head.length) {
    head.prepend(base);
  } else {
    $.root().prepend(`<head>${base}</head>`);
  }

  return $.html();
}

export type PreviewHtmlResult = { ok: boolean; html: string };

export async function renderPreviewHtml(
  organizationId: string,
  crawledPageId: string,
  context: VisitorContext,
): Promise<PreviewHtmlResult> {
  const [definition, page, elements] = await Promise.all([
    getLiveViewDefinition(organizationId, crawledPageId),
    prisma.crawledPage.findFirst({
      where: { id: crawledPageId, organizationId },
      select: { url: true },
    }),
    prisma.contentElement.findMany({
      where: { crawledPageId, organizationId },
      select: { id: true, selector: true, elementType: true, currentContent: true },
    }),
  ]);
  if (!page) throw new CrawledPageNotFoundError();

  const resolved = resolve(context, definition);
  const html = await fetchPageHtml(page.url);
  if (!html) return { ok: false, html: unavailableHtml(page.url) };

  const elementMeta = new Map(elements.map((el) => [el.id, el]));
  return { ok: true, html: applyPersonalizedSwaps(html, page.url, resolved, elementMeta) };
}
