import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

// Deterministic, AI-free structural extraction — no hero/features guessing
// here. Pulls a flat, generously-captured list of candidate elements;
// classifying them into sections is understand.ts's (the AI's) job, per
// product-spec's framing that understanding is AI-driven, not
// heuristic-driven. Kept deterministic specifically so it's cheap to unit
// test against fixed HTML fixtures with no network/AI call involved.

export type RawElementKind = "heading" | "paragraph" | "cta" | "image";

export type RawElement = {
  id: string;
  kind: RawElementKind;
  tag: string;
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  selector: string;
  order: number;
};

export type ExtractedPage = {
  title: string | null;
  elements: RawElement[];
};

const MAX_HEADINGS = 20;
const MAX_PARAGRAPHS = 15;
const MAX_CTAS = 20;
const MAX_IMAGES = 15;
const MIN_PARAGRAPH_LENGTH = 20;
const MAX_CTA_TEXT_LENGTH = 60; // longer than this reads as a paragraph, not a button/CTA
const MIN_IMAGE_DIMENSION = 32; // filters out icon-sized noise when dimensions are declared

// Accessibility skip-links — universal browser-chrome, never meaningful
// marketing content on any site, and never something a customer would want
// to personalize. Filtered at extraction so neither the heuristic nor a
// future AI classification step ever has to deal with them.
const SKIP_LINK_PHRASES = new Set(["skip to content", "skip to main content", "skip navigation"]);

function buildSelector($: cheerio.CheerioAPI, el: AnyNode): string {
  const parts: string[] = [];
  let current = $(el);
  let depth = 0;

  while (current.length && depth < 6) {
    const node = current.get(0);
    if (!node || node.type !== "tag") break;

    const id = current.attr("id");
    if (id) {
      parts.unshift(`#${id}`);
      break;
    }

    const tag = node.name;
    const parent = current.parent();
    const siblings = parent.children(tag);
    const index = siblings.index(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);

    if (tag === "body" || !parent.length) break;
    current = parent;
    depth += 1;
  }

  return parts.join(" > ");
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractPage(html: string): ExtractedPage {
  const $ = cheerio.load(html);
  const elements: RawElement[] = [];
  let order = 0;
  let idCounter = 0;
  const nextId = () => `el-${idCounter++}`;

  const title = normalizeText($("title").first().text()) || null;

  $("h1, h2, h3").each((_, el) => {
    if (elements.filter((e) => e.kind === "heading").length >= MAX_HEADINGS) return;
    const text = normalizeText($(el).text());
    if (!text) return;
    elements.push({
      id: nextId(),
      kind: "heading",
      tag: el.name,
      text,
      selector: buildSelector($, el),
      order: order++,
    });
  });

  $("p").each((_, el) => {
    if (elements.filter((e) => e.kind === "paragraph").length >= MAX_PARAGRAPHS) return;
    const text = normalizeText($(el).text());
    if (text.length < MIN_PARAGRAPH_LENGTH) return;
    elements.push({
      id: nextId(),
      kind: "paragraph",
      tag: "p",
      text,
      selector: buildSelector($, el),
      order: order++,
    });
  });

  $("a, button").each((_, el) => {
    if (elements.filter((e) => e.kind === "cta").length >= MAX_CTAS) return;
    const text = normalizeText($(el).text());
    if (!text || text.length > MAX_CTA_TEXT_LENGTH) return;
    if (SKIP_LINK_PHRASES.has(text.toLowerCase())) return;
    const href = el.name === "a" ? $(el).attr("href") : undefined;
    elements.push({
      id: nextId(),
      kind: "cta",
      tag: el.name,
      text,
      href,
      selector: buildSelector($, el),
      order: order++,
    });
  });

  $("img").each((_, el) => {
    if (elements.filter((e) => e.kind === "image").length >= MAX_IMAGES) return;
    const src = $(el).attr("src");
    if (!src) return;
    const width = Number($(el).attr("width"));
    const height = Number($(el).attr("height"));
    if (width && height && (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION)) return;
    elements.push({
      id: nextId(),
      kind: "image",
      tag: "img",
      src,
      alt: $(el).attr("alt"),
      selector: buildSelector($, el),
      order: order++,
    });
  });

  return { title, elements };
}

export function extractInternalLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, base);
      resolved.hash = "";
      if (resolved.hostname !== base.hostname) return;
      if (!["http:", "https:"].includes(resolved.protocol)) return;
      links.add(resolved.toString());
    } catch {
      // malformed href — skip, never let one bad link break the crawl
    }
  });

  return [...links];
}
