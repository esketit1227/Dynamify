import { safeFetch, assertSafeExternalUrl } from "@/lib/security/ssrfGuard";
import { fetchRobotsRules, isAllowedByRobots } from "@/lib/sites/robots";
import { extractPage, extractInternalLinks, type ExtractedPage } from "@/lib/sites/extract";

const MAX_PAGES = 15;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_CHARS = 2_000_000; // ~2MB, HTML is mostly single-byte chars
const TOTAL_CRAWL_TIMEOUT_MS = 60_000;

export type CrawledPageResult = ExtractedPage & { url: string };

export type CrawlResult = {
  pages: CrawledPageResult[];
};

export class CrawlError extends Error {}

// A root URL and its own internal links routinely disagree on trailing
// slashes ("https://example.com" vs the same site's own "/" nav link) —
// without normalizing, those crawl as two separate pages with identical
// content, which is exactly what makes a real, working personalization
// look broken when a user picks the "wrong" (unpersonalized) twin. Strips
// the hash (already stripped by extractInternalLinks, cheap to repeat
// defensively) and any trailing slash beyond the bare root.
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

// Every URL fetched — the root and every link the crawl follows — goes
// through the same SSRF guard as webhook dispatch (safeFetch re-validates
// on every redirect hop too). A same-origin link on a compromised or
// malicious site is exactly as untrusted as a directly-submitted URL.
export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const response = await safeFetch(url, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "User-Agent": "DynamifyBot/1.0 (+https://dynamify.example/bot)" },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const text = await response.text();
    return text.length > MAX_RESPONSE_CHARS ? text.slice(0, MAX_RESPONSE_CHARS) : text;
  } catch {
    return null; // one unreachable page should never abort the whole crawl
  }
}

export async function crawlSite(rootUrl: string): Promise<CrawlResult> {
  await assertSafeExternalUrl(rootUrl); // fail fast, with a clear reason, before any fetch

  const origin = new URL(rootUrl).origin;
  const robotsRules = await fetchRobotsRules(origin);

  const deadline = Date.now() + TOTAL_CRAWL_TIMEOUT_MS;
  const visited = new Set<string>();
  const root = normalizeUrl(rootUrl);
  const queued = new Set<string>([root]);
  const queue: string[] = [root];
  const pages: CrawledPageResult[] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES && Date.now() < deadline) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!isAllowedByRobots(robotsRules, pathname)) continue;

    const html = await fetchPageHtml(url);
    if (html === null) continue;

    const { title, elements } = extractPage(html);
    pages.push({ url, title, elements });

    if (pages.length < MAX_PAGES) {
      for (const rawLink of extractInternalLinks(html, url)) {
        const link = normalizeUrl(rawLink);
        if (!visited.has(link) && !queued.has(link)) {
          queued.add(link);
          queue.push(link);
        }
      }
    }
  }

  if (pages.length === 0) {
    throw new CrawlError(
      "Couldn't read any pages from this site — it may block automated requests, require login, or be unreachable.",
    );
  }

  return { pages };
}
