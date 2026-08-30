"use client";

import { useEffect, useRef, useState } from "react";
import type { VisitorContext } from "@dynamify/personalization-sdk";

// Real device viewport sizes — the iframe renders at these dimensions so
// the site's own responsive CSS actually fires the matching breakpoint,
// not just "whatever width the grid column happens to be."
const DEVICE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};
const DEFAULT_DIMENSIONS = DEVICE_DIMENSIONS.desktop;

// Renders the real, live page with only the personalized-for-this-context
// elements swapped in (server-rewritten by preview-html/route.ts). The
// sandbox has no `allow-scripts` — the target site's own <script> tags are
// present in the markup but the browser refuses to execute them. This is
// the primary control; the response's CSP (as both a header and, since
// this fetches the body itself rather than a bare <iframe src>, a <meta>
// tag baked into the HTML — see PREVIEW_CSP in renderPreview.ts) is the
// second, independent one.
//
// Fetches rather than a plain `<iframe src>` so the real/unavailable
// signal (the `X-Dynamify-Preview` header) can be read once, from the
// same request that gets the HTML — no second round-trip, and callers
// that care (Live View) can react to it via `onAvailabilityChange`;
// callers that don't (the demo window) just render whatever comes back,
// identical to the old behavior.
export function WebsitePreview({
  organizationId,
  pageId,
  context,
  device,
  label,
  onAvailabilityChange,
}: {
  organizationId: string;
  pageId: string;
  context: VisitorContext;
  device?: VisitorContext["device"];
  label: string;
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const src = `/api/organizations/${organizationId}/live-view/${pageId}/preview-html?context=${encodeURIComponent(
    JSON.stringify(context),
  )}`;

  const { width: deviceWidth, height: deviceHeight } =
    (device && DEVICE_DIMENSIONS[device]) || DEFAULT_DIMENSIONS;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(deviceWidth);
  const [html, setHtml] = useState<string | null>(null);
  // React's own documented pattern for resetting state when a prop
  // changes, without an effect: adjust state during render itself. Avoids
  // the effect below calling setState synchronously at its top (flagged
  // by the React Compiler's lint rule) and avoids an extra render pass —
  // the stale `html` from the previous `src` never paints even for a
  // frame.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setHtml(null);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then(async (res) => {
        const available = res.headers.get("X-Dynamify-Preview") !== "unavailable";
        const body = await res.text();
        if (cancelled) return;
        setHtml(body);
        onAvailabilityChange?.(available);
      })
      .catch(() => {
        if (!cancelled) onAvailabilityChange?.(false);
      });
    return () => {
      cancelled = true;
    };
    // onAvailabilityChange intentionally excluded — callers pass an
    // inline function, and re-running this fetch because that function
    // reference changed (not because src did) would refetch on every
    // parent render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Never stretch a mobile/tablet frame past its real size — only ever
  // shrink to fit, the same way desktop always has to.
  const scale = Math.min(1, containerWidth / deviceWidth);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-baseline justify-between border-b border-border bg-background px-3 py-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-[10px] text-muted">
          {deviceWidth}×{deviceHeight}
        </span>
      </div>
      <div
        ref={containerRef}
        className="w-full overflow-hidden bg-background"
        style={{ height: deviceHeight * scale }}
      >
        <div
          style={{
            width: deviceWidth,
            height: deviceHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <iframe
            key={src}
            srcDoc={html ?? ""}
            sandbox="allow-same-origin"
            title={label}
            style={{ width: deviceWidth, height: deviceHeight, border: 0 }}
            className="bg-white"
          />
        </div>
      </div>
    </div>
  );
}
