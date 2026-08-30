"use client";

import { useState } from "react";

// Phase 2 (docs/roadmap.md): "the company installs one script tag." This
// just displays it — public/dynamify-embed.js and the public
// /api/embed/site/[siteId]/elements endpoint do the actual work. `origin`
// is computed server-side (from request headers, see the page component)
// rather than window.location, so there's no client-only effect and no
// hydration mismatch to work around.
export function EmbedSnippet({ siteId, origin }: { siteId: string; origin: string }) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${origin}/dynamify-embed.js" data-site-id="${siteId}" async></script>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Install on your site</h2>
      <p className="mb-3 text-xs text-muted">
        Paste this one script tag anywhere on your page. It doesn&apos;t change anything visible yet
        — it verifies each element we found is still there before anything is personalized.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
          {snippet}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-border px-3 py-2 text-xs text-foreground"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Add <code>?dynamify_debug=1</code> to any page URL after installing to see which elements
        matched, highlighted directly on your live site.
      </p>
    </div>
  );
}
