// Minimal robots.txt parser — only what's needed to respect Disallow rules
// for a generic crawler (no wildcards/crawl-delay support). Missing or
// unparseable robots.txt is treated as "everything allowed" — a crawl
// should never abort over that, only actual Disallow rules should narrow it.

type RobotsRules = { disallow: string[] };

function parseRobotsTxt(text: string): RobotsRules {
  const disallow: string[] = [];
  let applies = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const directive = key.trim().toLowerCase();

    if (directive === "user-agent") {
      applies = value === "*";
    } else if (applies && directive === "disallow" && value) {
      disallow.push(value);
    }
  }

  return { disallow };
}

export async function fetchRobotsRules(origin: string): Promise<RobotsRules> {
  try {
    const res = await fetch(new URL("/robots.txt", origin).toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { disallow: [] };
    const text = await res.text();
    return parseRobotsTxt(text);
  } catch {
    return { disallow: [] };
  }
}

export function isAllowedByRobots(rules: RobotsRules, pathname: string): boolean {
  return !rules.disallow.some((prefix) => pathname.startsWith(prefix));
}
