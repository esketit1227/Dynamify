import type { ComponentType } from "@/lib/pages/componentFields";

type Props = {
  componentId: string;
  variantId?: string;
  type: ComponentType;
  content: Record<string, unknown>;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function lines(value: unknown): string[] {
  return str(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// data-track values are read by a single delegated listener in
// PersonalizedPage (click for cta_click/form_submit, focus for form_start) —
// simpler than wiring an event handler per interactive element.
function renderContent(type: ComponentType, content: Record<string, unknown>) {
  switch (type) {
    case "HERO":
      return (
        <section className="px-6 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight">
            {str(content.headline)}
          </h1>
          {content.subheadline ? (
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">{str(content.subheadline)}</p>
          ) : null}
          {content.ctaLabel ? (
            <a
              href={str(content.ctaHref) || "#"}
              data-track="cta_click"
              className="mt-8 inline-block rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-foreground"
            >
              {str(content.ctaLabel)}
            </a>
          ) : null}
        </section>
      );

    case "TEXT":
      return (
        <section className="mx-auto max-w-2xl px-6 py-12">
          <p className="whitespace-pre-line text-base text-foreground">{str(content.body)}</p>
        </section>
      );

    case "IMAGE":
      return content.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- public pages render arbitrary user-supplied URLs, not local assets
        <img src={str(content.url)} alt={str(content.alt)} className="mx-auto max-w-full" />
      ) : null;

    case "CTA":
      return content.label ? (
        <section className="px-6 py-12 text-center">
          <a
            href={str(content.href) || "#"}
            data-track="cta_click"
            className="inline-block rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-foreground"
          >
            {str(content.label)}
          </a>
        </section>
      ) : null;

    case "FEATURES":
      return (
        <section className="mx-auto grid max-w-4xl gap-6 px-6 py-12 sm:grid-cols-2">
          {lines(content.items).map((item, i) => {
            const [title, ...rest] = item.split(":");
            return (
              <div key={i}>
                <h3 className="font-medium">{title.trim()}</h3>
                {rest.length > 0 ? (
                  <p className="mt-1 text-sm text-muted">{rest.join(":").trim()}</p>
                ) : null}
              </div>
            );
          })}
        </section>
      );

    case "TESTIMONIALS":
      return (
        <section className="mx-auto max-w-3xl px-6 py-12">
          {lines(content.items).map((item, i) => (
            <blockquote key={i} className="mb-4 border-l-2 border-border pl-4 text-muted">
              {item}
            </blockquote>
          ))}
        </section>
      );

    case "LOGOS":
      return (
        <section className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-6 py-12">
          {lines(content.items).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- see IMAGE case
            <img key={i} src={url} alt="" className="h-8 opacity-70" />
          ))}
        </section>
      );

    case "PRICING":
      return (
        <section className="mx-auto grid max-w-4xl gap-6 px-6 py-12 sm:grid-cols-3">
          {lines(content.items).map((item, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              {item}
            </div>
          ))}
        </section>
      );

    case "FAQ":
      return (
        <section className="mx-auto max-w-2xl px-6 py-12">
          {lines(content.items).map((item, i) => {
            const [q, a] = item.split("|");
            return (
              <div key={i} className="mb-4">
                <p className="font-medium">{q?.trim()}</p>
                {a ? <p className="mt-1 text-sm text-muted">{a.trim()}</p> : null}
              </div>
            );
          })}
        </section>
      );

    case "FORM":
      return (
        <section className="mx-auto max-w-md px-6 py-12">
          <form
            data-track="form_start"
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-3"
          >
            {lines(content.fields).map((field, i) => (
              <input
                key={i}
                placeholder={field}
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
            ))}
            <button
              type="submit"
              data-track="form_submit"
              className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              {str(content.submitLabel) || "Submit"}
            </button>
          </form>
        </section>
      );

    default:
      return null;
  }
}

export function ComponentBlock({ componentId, variantId, type, content }: Props) {
  return (
    <div data-component-id={componentId} data-variant-id={variantId}>
      {renderContent(type, content)}
    </div>
  );
}
