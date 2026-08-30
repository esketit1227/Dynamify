"use client";

import { COMPONENT_FIELDS, type ComponentType } from "@/lib/pages/componentFields";

// Shared field renderer for both a component's default content and a
// personalization variant's content — same field set per type either way.
export function ComponentFormFields({
  type,
  values,
  onChange,
}: {
  type: ComponentType;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {COMPONENT_FIELDS[type].map((field) => (
        <div key={field.key}>
          <label className="mb-1 block text-xs font-medium text-muted">{field.label}</label>
          {field.kind === "textarea" ? (
            <textarea
              value={values[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.key, e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          ) : (
            <input
              type={field.kind === "url" ? "url" : "text"}
              value={values[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          )}
          {field.helpText ? <p className="mt-1 text-xs text-muted">{field.helpText}</p> : null}
        </div>
      ))}
    </div>
  );
}
