import type { VisitorContext } from "@dynamify/personalization-sdk";

// Pure, no I/O — same discipline as the personalization engine itself
// (CLAUDE.md). Given raw contexts for one page's traffic, finds segments
// worth surfacing as a recommendation. Nothing here touches the database;
// the service layer decides what to do with the result.

export const MIN_SAMPLE_SIZE = 10;
export const MIN_SHARE = 0.2;

export type SegmentField = "device" | "geo.country" | "utm.source" | "utm.medium" | "utm.campaign" | "referrer";

export type SegmentCandidate = {
  field: SegmentField;
  value: string;
  matchingEvents: number;
  totalEvents: number;
  share: number;
};

// The referrer is a full URL ("https://www.linkedin.com/feed/") — too
// granular to segment on directly, so this reduces it to a bare domain
// ("linkedin.com") the same way a human would describe a traffic source.
// Unparseable/relative referrers just don't contribute a value, same as
// any other missing field.
function referrerDomain(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}

const FIELD_EXTRACTORS: { field: SegmentField; extract: (context: VisitorContext) => string | undefined }[] = [
  { field: "device", extract: (c) => c.device },
  { field: "geo.country", extract: (c) => c.geo?.country },
  { field: "utm.source", extract: (c) => c.utm?.source },
  { field: "utm.medium", extract: (c) => c.utm?.medium },
  { field: "utm.campaign", extract: (c) => c.utm?.campaign },
  { field: "referrer", extract: (c) => referrerDomain(c.referrer) },
];

// A segment qualifies when the page has enough total traffic to say
// anything meaningful (MIN_SAMPLE_SIZE) and the value accounts for a
// large-enough share of it (MIN_SHARE) to be worth a human's attention.
// Sorted by share, largest first — the most obvious segment leads.
export function analyzeSegments(contexts: VisitorContext[]): SegmentCandidate[] {
  const totalEvents = contexts.length;
  if (totalEvents < MIN_SAMPLE_SIZE) return [];

  const candidates: SegmentCandidate[] = [];

  for (const { field, extract } of FIELD_EXTRACTORS) {
    const counts = new Map<string, number>();
    for (const context of contexts) {
      const value = extract(context);
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    for (const [value, matchingEvents] of counts) {
      const share = matchingEvents / totalEvents;
      if (share >= MIN_SHARE) {
        candidates.push({ field, value, matchingEvents, totalEvents, share });
      }
    }
  }

  return candidates.sort((a, b) => b.share - a.share);
}
