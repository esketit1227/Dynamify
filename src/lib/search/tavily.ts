import { z } from "zod";
import { HttpError } from "@/lib/auth/errors";
import { env } from "@/lib/env";

// docs/decisions.md D9 (revised 2026-09-07: AI-knowledge-only -> real web
// search). Same optional, gracefully-degrading shape as every other
// integration in this app (ipinfo, OpenAI images, Resend): unset means
// this throws before any network call, and every caller treats that
// exactly like "not configured," not an error worth surfacing to the end
// user.
export class MarketResearchNotConfiguredError extends HttpError {
  constructor() {
    super(503, "Market research isn't configured yet — set TAVILY_API_KEY to enable it.");
  }
}

export class MarketResearchError extends HttpError {
  constructor(message = "Market research failed. Try again.") {
    super(502, message);
  }
}

export type SearchResult = { title: string; url: string; content: string };

const searchResultSchema = z.object({
  title: z.string().max(300),
  // Tavily returns the URL it actually fetched — validated as an absolute
  // http(s) URL here (not just "looks like a URL") since this is rendered
  // as a real, clickable citation link later (page-design-review.tsx);
  // z.string().url() alone would accept a syntactically valid
  // "javascript:" URL, so the scheme is checked explicitly.
  url: z
    .string()
    .max(2000)
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Only http/https URLs are allowed"),
  content: z.string().max(4000),
});

const searchResponseSchema = z.object({
  results: z.array(searchResultSchema).max(20),
});

const SEARCH_TIMEOUT_MS = 15_000;

// Tavily's host is a fixed, known literal (env.TAVILY_BASE_URL), never
// attacker-controlled — same reasoning src/lib/enrichment/ipFirmographics.ts
// already documents for using plain fetch instead of the SSRF guard
// (src/lib/security/ssrfGuard.ts), which would also block pointing this at
// a localhost mock for live verification. The results this returns are
// pre-fetched snippets, not raw pages we fetch ourselves — this call never
// introduces a new "fetch an arbitrary third-party URL" surface at all.
export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  if (!env.TAVILY_API_KEY) throw new MarketResearchNotConfiguredError();

  let response: Response;
  try {
    response = await fetch(`${env.TAVILY_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(maxResults, 1), 10),
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch {
    throw new MarketResearchError("Search request failed. Try again.");
  }

  if (!response.ok) throw new MarketResearchError("Search provider returned an error.");

  const parsed = searchResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new MarketResearchError("Search provider returned an unexpected shape.");

  return parsed.data.results;
}
