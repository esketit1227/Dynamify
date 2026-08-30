import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4InRange(ip: string, base: string, maskBits: number): boolean {
  const toInt = (addr: string) =>
    addr.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — includes cloud metadata (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast+
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => ipv4InRange(ip, base, bits));
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" || // loopback
    normalized === "::" ||
    normalized.startsWith("fe80:") || // link-local
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") || // unique local
    normalized.startsWith("::ffff:") // IPv4-mapped — check the embedded v4 too
  );
}

// Shared with src/lib/enrichment/ipFirmographics.ts — a client-supplied IP
// (e.g. from a proxy header) needs the exact same private/internal-range
// rejection an outbound URL's hostname does, so this reuses the same range
// tables rather than a second copy that could drift from this one.
export function isPrivateIp(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIpv4(ip);
  if (isIPv6(ip)) return isPrivateIpv6(ip);
  return true; // not a recognizable IP at all — treat as unsafe, not "unknown"
}

// CLAUDE.md: outbound fetches must allowlist protocols and block localhost/
// private ranges/cloud metadata. Shared by every outbound fetch to a
// user-supplied URL: webhook registration + every dispatch (DNS can change
// between the two), and the site crawler's root URL + every link it follows.
export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http/https URLs are allowed");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("Localhost URLs are not allowed");
  }

  if (isIPv4(hostname) && isPrivateIpv4(hostname)) {
    throw new UnsafeUrlError("Private/internal IP addresses are not allowed");
  }
  if (isIPv6(hostname) && isPrivateIpv6(hostname)) {
    throw new UnsafeUrlError("Private/internal IP addresses are not allowed");
  }

  if (!isIPv4(hostname) && !isIPv6(hostname)) {
    let resolved;
    try {
      resolved = await lookup(hostname, { all: true });
    } catch {
      throw new UnsafeUrlError("Could not resolve hostname");
    }
    for (const { address, family } of resolved) {
      if (family === 4 && isPrivateIpv4(address)) {
        throw new UnsafeUrlError("Hostname resolves to a private/internal IP address");
      }
      if (family === 6 && isPrivateIpv6(address)) {
        throw new UnsafeUrlError("Hostname resolves to a private/internal IP address");
      }
    }
  }
}

const MAX_REDIRECTS = 5;

// fetch()'s default redirect handling follows hops transparently — a
// malicious page could redirect to an internal address and every SSRF check
// on the *original* URL would be moot. This validates every hop itself
// (redirect: "manual") before following it, so real-world redirects (www,
// http->https) still work but can't be used to reach an internal address.
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeExternalUrl(currentUrl);
    const response = await fetch(currentUrl, { ...init, redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new UnsafeUrlError("Too many redirects");
}
