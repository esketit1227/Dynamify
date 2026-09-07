import type { PageDesignSection } from "@/lib/sites/designPage";

// Presentational only — no fetching, no state. Deliberately NOT built on
// RenderedPreview/ResolvedPage (src/components/liveview/rendered-preview.tsx):
// that type carries real ContentElement ids and SDK-shaped personalization
// provenance (matchedVariantId/matchedRuleId) a page design has none of —
// forcing this data through it would mean fabricating ids. The browser-
// chrome frame below intentionally echoes RenderedPreview's ~12 lines of
// styling so the two previews read as one family, without coupling a
// churning new layout library to a live, high-traffic surface.

function ImagePlaceholder({ description }: { description?: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-background px-4 text-center">
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      <p className="text-[11px] text-muted/70">Image concept — not generated</p>
    </div>
  );
}

function QuoteList({ quotes, grid }: { quotes: string[]; grid: boolean }) {
  return (
    <div className={grid ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-4"}>
      {quotes.map((quote, i) => (
        <blockquote
          key={i}
          className={`rounded-lg border border-border bg-background p-4 text-foreground ${grid ? "text-sm" : "text-xl leading-relaxed"}`}
        >
          “{quote}”
          <p className="mt-2 text-[11px] font-medium text-muted">From your site</p>
        </blockquote>
      ))}
    </div>
  );
}

function Section({ section }: { section: PageDesignSection }) {
  const heading = section.headline ? (
    <h2 className="text-2xl font-semibold tracking-tight text-foreground">{section.headline}</h2>
  ) : null;
  const sub = section.subheadline ? <p className="text-base text-muted">{section.subheadline}</p> : null;
  const cta = section.ctaLabel ? (
    <span className="inline-flex w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
      {section.ctaLabel}
    </span>
  ) : null;

  switch (section.layout) {
    case "HERO_CENTERED":
      return (
        <section className="flex flex-col items-center gap-4 text-center">
          {heading}
          {sub}
          {cta}
        </section>
      );

    case "HERO_SPLIT":
      return (
        <section className="grid gap-8 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-4">
            {heading}
            {sub}
            {cta}
          </div>
          <ImagePlaceholder description={section.imageDescription} />
        </section>
      );

    case "FEATURES_GRID":
      return (
        <section className="flex flex-col gap-4">
          {heading}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(section.items ?? []).map((item, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-4 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </section>
      );

    case "FEATURES_ALTERNATING":
      return (
        <section className="flex flex-col gap-6">
          {heading}
          {(section.items ?? []).map((item, i) => (
            <div key={i} className="grid gap-4 md:grid-cols-2 md:items-center">
              <p className="text-sm text-foreground">{item}</p>
              <div className={i % 2 === 1 ? "md:order-first" : ""}>
                <ImagePlaceholder />
              </div>
            </div>
          ))}
        </section>
      );

    case "TESTIMONIALS_QUOTE":
      return (
        <section className="flex flex-col gap-4">
          {heading}
          <QuoteList quotes={section.quotes ?? []} grid={false} />
        </section>
      );

    case "TESTIMONIALS_GRID":
      return (
        <section className="flex flex-col gap-4">
          {heading}
          <QuoteList quotes={section.quotes ?? []} grid />
        </section>
      );

    case "CTA_BANNER":
      return (
        <section className="flex flex-col items-center gap-3 rounded-2xl bg-foreground p-8 text-center text-background">
          {heading ? <h2 className="text-2xl font-semibold tracking-tight">{section.headline}</h2> : null}
          {section.ctaLabel ? (
            <span className="inline-flex w-fit rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground">
              {section.ctaLabel}
            </span>
          ) : null}
        </section>
      );

    case "CTA_INLINE":
      return (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background p-4">
          {heading}
          {cta}
        </section>
      );

    default:
      return null;
  }
}

export function PageDesignPreview({ sections, pageUrl }: { sections: PageDesignSection[]; pageUrl: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border bg-background px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-2.5 truncate rounded-md bg-surface px-2.5 py-1 text-xs text-muted">{pageUrl}</span>
      </div>

      <div className="max-h-[560px] overflow-y-auto px-6 py-8 sm:px-10">
        {sections.length === 0 ? (
          <p className="text-sm text-muted">This design couldn&apos;t be read.</p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-10">
            {sections.map((section, i) => (
              <Section key={i} section={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
