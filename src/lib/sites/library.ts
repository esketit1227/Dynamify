// Types with no free-text "content" to speak of — these elements' personalize
// form offers a picker built from other real values of the same type found
// elsewhere on the site (the "approved asset library" for v1: reuse, never
// invent — same principle text personalization already uses), instead of a
// free-text box.
export const LIBRARY_TYPES = new Set(["IMAGE", "LOGO", "CTA_HREF"]);

export type Library = Record<string, string[]>;

// Shared by site-detail.tsx (site-wide), live-view.tsx (page-scoped), and
// src/lib/content/service.ts's getSiteWideImageLibrary (site-wide) — one
// definition of "what counts as a real, reusable alternative," not three
// copies drifting apart.
export function buildLibraryFromElements(elements: { elementType: string; currentContent: string }[]): Library {
  const seen: Record<string, Set<string>> = {};
  for (const el of elements) {
    if (!LIBRARY_TYPES.has(el.elementType)) continue;
    (seen[el.elementType] ??= new Set()).add(el.currentContent);
  }
  const library: Library = {};
  for (const [type, set] of Object.entries(seen)) library[type] = [...set];
  return library;
}
