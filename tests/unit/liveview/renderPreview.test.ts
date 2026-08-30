import { describe, it, expect } from "vitest";
import type { ResolvedPage } from "@dynamify/personalization-sdk";
import { applyPersonalizedSwaps, unavailableHtml } from "@/lib/liveview/renderPreview";

const PAGE_URL = "https://example.com/";

function resolvedPage(components: ResolvedPage["components"]): ResolvedPage {
  return { id: "page-1", components };
}

describe("applyPersonalizedSwaps", () => {
  it("swaps text content into the exact matching selector", () => {
    const html = `<html><head></head><body><h1>Original headline</h1></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "HEADLINE",
        order: 0,
        content: { text: "Personalized headline" },
        matchedVariantId: "variant-1",
      },
    ]);
    const meta = new Map([
      ["el-1", { selector: "h1", elementType: "HEADLINE", currentContent: "Original headline" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);

    expect(result).toContain("Personalized headline");
    expect(result).not.toContain("Original headline");
  });

  it("skips a swap when the live content has drifted from what was crawled", () => {
    const html = `<html><head></head><body><h1>A completely rewritten headline</h1></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "HEADLINE",
        order: 0,
        content: { text: "Personalized headline" },
        matchedVariantId: "variant-1",
      },
    ]);
    // Stored crawl-time content no longer matches what's live at that
    // selector — the site changed since the crawl (docs/decisions.md D2/D3).
    const meta = new Map([
      ["el-1", { selector: "h1", elementType: "HEADLINE", currentContent: "Original headline" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).not.toContain("Personalized headline");
    expect(result).toContain("A completely rewritten headline");
  });

  it("never touches elements without a matchedVariantId", () => {
    const html = `<html><head></head><body><h1>Original headline</h1></body></html>`;
    const resolved = resolvedPage([
      { id: "el-1", type: "HEADLINE", order: 0, content: { text: "Original headline" } },
    ]);
    const meta = new Map([
      ["el-1", { selector: "h1", elementType: "HEADLINE", currentContent: "Original headline" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).toContain("Original headline");
  });

  it("skips a swap when the selector matches nothing on the live page (drifted DOM)", () => {
    const html = `<html><head></head><body><p>No heading here anymore</p></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "HEADLINE",
        order: 0,
        content: { text: "Personalized headline" },
        matchedVariantId: "variant-1",
      },
    ]);
    const meta = new Map([
      ["el-1", { selector: "h1", elementType: "HEADLINE", currentContent: "Original headline" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).not.toContain("Personalized headline");
    expect(result).toContain("No heading here anymore");
  });

  it("skips a swap when the selector matches more than one node (ambiguous, never guess)", () => {
    const html = `<html><head></head><body><h1>First</h1><h1>Second</h1></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "HEADLINE",
        order: 0,
        content: { text: "Personalized headline" },
        matchedVariantId: "variant-1",
      },
    ]);
    const meta = new Map([
      ["el-1", { selector: "h1", elementType: "HEADLINE", currentContent: "Original headline" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).not.toContain("Personalized headline");
    expect(result).toContain("First");
    expect(result).toContain("Second");
  });

  it("sets href for CTA_HREF elements instead of text content", () => {
    const html = `<html><head></head><body><a id="cta" href="/old">Click</a></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "CTA_HREF",
        order: 0,
        content: { text: "/new" },
        matchedVariantId: "variant-1",
      },
    ]);
    const meta = new Map([
      ["el-1", { selector: "#cta", elementType: "CTA_HREF", currentContent: "/old" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).toContain('href="/new"');
    expect(result).toContain("Click"); // text untouched for a href-type element
  });

  it("skips a swap when the live href has drifted from what was crawled", () => {
    const html = `<html><head></head><body><a id="cta" href="/changed">Click</a></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "CTA_HREF",
        order: 0,
        content: { text: "/new" },
        matchedVariantId: "variant-1",
      },
    ]);
    const meta = new Map([
      ["el-1", { selector: "#cta", elementType: "CTA_HREF", currentContent: "/old" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).toContain('href="/changed"');
    expect(result).not.toContain('href="/new"');
  });

  it("sets src for IMAGE/LOGO elements instead of text content", () => {
    const html = `<html><head></head><body><img id="logo" src="/old.png" /></body></html>`;
    const resolved = resolvedPage([
      {
        id: "el-1",
        type: "LOGO",
        order: 0,
        content: { text: "/new.png" },
        matchedVariantId: "variant-1",
      },
    ]);
    const meta = new Map([
      ["el-1", { selector: "#logo", elementType: "LOGO", currentContent: "/old.png" }],
    ]);

    const result = applyPersonalizedSwaps(html, PAGE_URL, resolved, meta);
    expect(result).toContain('src="/new.png"');
  });

  it("injects a <base> tag pointing at the real page URL so relative assets still resolve", () => {
    const html = `<html><head><title>Real site</title></head><body></body></html>`;
    const result = applyPersonalizedSwaps(html, PAGE_URL, resolvedPage([]), new Map());
    expect(result).toContain(`<base href="${PAGE_URL}">`);
  });

  it("adds a <head> with a base tag even when the fetched page has none", () => {
    const html = `<body><p>No head tag at all</p></body>`;
    const result = applyPersonalizedSwaps(html, PAGE_URL, resolvedPage([]), new Map());
    expect(result).toContain(`<base href="${PAGE_URL}">`);
  });
});

describe("unavailableHtml", () => {
  it("links to the real page instead of failing silently", () => {
    const html = unavailableHtml(PAGE_URL);
    expect(html).toContain(PAGE_URL);
  });
});
