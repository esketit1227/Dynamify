import { describe, it, expect } from "vitest";
import { extractPage, extractInternalLinks } from "@/lib/sites/extract";

describe("extractPage", () => {
  it("extracts headings, paragraphs, CTAs, and images", () => {
    const html = `
      <html><head><title>Acme — Project Management</title></head>
      <body>
        <h1>The smarter way to manage your projects.</h1>
        <p>Acme helps growing teams plan, build, and ship without the chaos of spreadsheets and status meetings.</p>
        <a href="/signup">Start Free Trial</a>
        <img src="/hero.png" alt="Product screenshot" width="800" height="600" />
      </body></html>
    `;

    const result = extractPage(html);
    expect(result.title).toBe("Acme — Project Management");

    const heading = result.elements.find((e) => e.kind === "heading");
    expect(heading?.text).toBe("The smarter way to manage your projects.");
    expect(heading?.tag).toBe("h1");

    const paragraph = result.elements.find((e) => e.kind === "paragraph");
    expect(paragraph?.text).toContain("Acme helps growing teams");

    const cta = result.elements.find((e) => e.kind === "cta");
    expect(cta?.text).toBe("Start Free Trial");
    expect(cta?.href).toBe("/signup");

    const image = result.elements.find((e) => e.kind === "image");
    expect(image?.src).toBe("/hero.png");
    expect(image?.alt).toBe("Product screenshot");
  });

  it("skips paragraphs that are too short to be real content", () => {
    const html = `<html><body><p>Hi</p><p>OK</p></body></html>`;
    const result = extractPage(html);
    expect(result.elements.filter((e) => e.kind === "paragraph")).toHaveLength(0);
  });

  it("skips links whose text is too long to be a CTA (reads as a paragraph instead)", () => {
    const longText = "This is a very long link that reads much more like a sentence than a button label at all";
    const html = `<html><body><a href="/x">${longText}</a></body></html>`;
    const result = extractPage(html);
    expect(result.elements.filter((e) => e.kind === "cta")).toHaveLength(0);
  });

  it("filters out accessibility skip-links from CTAs (case-insensitive)", () => {
    const html = `<html><body><a href="#main">Skip to content</a><a href="/signup">Sign up</a></body></html>`;
    const result = extractPage(html);
    const ctas = result.elements.filter((e) => e.kind === "cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0].text).toBe("Sign up");
  });

  it("filters out icon-sized images when dimensions are declared", () => {
    const html = `<html><body><img src="/icon.svg" width="16" height="16" /><img src="/hero.jpg" width="1200" height="600" /></body></html>`;
    const result = extractPage(html);
    const images = result.elements.filter((e) => e.kind === "image");
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("/hero.jpg");
  });

  it("produces a stable, non-empty selector for every element", () => {
    const html = `<html><body><section><div><h2>Features</h2></div></section></body></html>`;
    const result = extractPage(html);
    const heading = result.elements.find((e) => e.kind === "heading");
    expect(heading?.selector).toBeTruthy();
    expect(heading?.selector.length).toBeGreaterThan(0);
  });

  it("never throws on malformed or nearly-empty HTML", () => {
    expect(() => extractPage("")).not.toThrow();
    expect(() => extractPage("<html><body><h1>")).not.toThrow();
    expect(() => extractPage("not html at all, just text")).not.toThrow();
  });
});

describe("extractInternalLinks", () => {
  it("resolves relative links against the page URL", () => {
    const html = `<a href="/pricing">Pricing</a>`;
    const links = extractInternalLinks(html, "https://acme.com/home");
    expect(links).toContain("https://acme.com/pricing");
  });

  it("excludes links to a different origin", () => {
    const html = `<a href="https://other.com/page">Other</a><a href="/local">Local</a>`;
    const links = extractInternalLinks(html, "https://acme.com/");
    expect(links).toEqual(["https://acme.com/local"]);
  });

  it("strips hash fragments so anchors don't count as distinct pages", () => {
    const html = `<a href="/pricing#faq">Pricing FAQ</a>`;
    const links = extractInternalLinks(html, "https://acme.com/");
    expect(links).toEqual(["https://acme.com/pricing"]);
  });

  it("excludes non-http(s) links like mailto: and tel:", () => {
    const html = `<a href="mailto:hi@acme.com">Email</a><a href="tel:+123">Call</a>`;
    const links = extractInternalLinks(html, "https://acme.com/");
    expect(links).toHaveLength(0);
  });

  it("never throws on a malformed href", () => {
    const html = `<a href="http://[::badipv6">Broken</a>`;
    expect(() => extractInternalLinks(html, "https://acme.com/")).not.toThrow();
  });
});
