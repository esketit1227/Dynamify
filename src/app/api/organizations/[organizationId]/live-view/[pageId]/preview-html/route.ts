import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { renderPreviewHtml, PREVIEW_CSP } from "@/lib/liveview/renderPreview";
import { visitorContextSchema } from "@/lib/validation/visitorContext";
import { rateLimit } from "@/lib/auth/rateLimit";
import { RateLimitedError, HttpError } from "@/lib/auth/errors";
import { ZodError } from "zod";

// Serves a live re-fetch of the customer's real page with only the
// personalized-for-this-context elements swapped in, so it can sit in a
// sandboxed <iframe> (see website-preview.tsx) — never proxying anything
// the target site sent us (headers, cookies) beyond its raw body. The CSP
// is set both as a header (for a direct <iframe src>) and, by
// renderPreviewHtml itself, as a <meta> tag (for a caller that fetches
// the body and renders it via `srcDoc` instead, where the header alone
// wouldn't apply — see PREVIEW_CSP's own comment).
function htmlResponse(body: string, status = 200, available = true): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": PREVIEW_CSP,
      // Lets a caller that fetches this itself (rather than a bare
      // <iframe src>) know whether this is the real page or the
      // graceful "couldn't load" fallback, without parsing HTML.
      "X-Dynamify-Preview": available ? "ok" : "unavailable",
    },
  });
}

function errorHtml(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font:14px system-ui;color:#666;padding:2rem;text-align:center;"><p>${message}</p></body></html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; pageId: string }> },
) {
  try {
    const { organizationId, pageId } = await params;
    const { organization } = await requireOrgAccess(organizationId);

    const limited = await rateLimit(`preview-html:${organization.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limited.allowed) {
      throw new RateLimitedError("Too many requests. Try again shortly.", limited.retryAfterMs);
    }

    const raw = new URL(request.url).searchParams.get("context");
    let parsed: unknown = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return htmlResponse(errorHtml("Invalid visitor profile."), 400, false);
      }
    }
    const context = visitorContextSchema.parse(parsed);

    const result = await renderPreviewHtml(organization.id, pageId, context);
    return htmlResponse(result.html, 200, result.ok);
  } catch (error) {
    if (error instanceof ZodError) {
      return htmlResponse(errorHtml("Invalid visitor profile."), 400, false);
    }
    if (error instanceof RateLimitedError) {
      return htmlResponse(errorHtml(error.message), error.status, false);
    }
    if (error instanceof HttpError) {
      return htmlResponse(errorHtml(error.message), error.status, false);
    }
    console.error("preview-html error:", error);
    return htmlResponse(errorHtml("Preview unavailable."), 500, false);
  }
}
