// Same header-based origin derivation used first for the embed snippet
// (originally inline in src/app/(dashboard)/sites/[siteId]/page.tsx),
// pulled out here so a second caller (password-reset emails, which need
// an absolute link back into the app and only ever run in a route
// handler, not a page component) doesn't reimplement it. Accepts anything
// with Headers' `.get()` shape so both a route handler's raw
// `request.headers` and a page component's `await headers()` (Next's own
// ReadonlyHeaders) work without adapting either call site.
export function originFromHeaders(headers: { get(name: string): string | null }): string {
  const host = headers.get("host") ?? "localhost:3000";
  const protocol = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
