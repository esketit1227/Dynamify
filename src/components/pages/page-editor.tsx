"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ComponentFormFields } from "@/components/pages/component-form-fields";
import { PersonalizeSection } from "@/components/pages/personalize-section";
import { GenerateCopyButton } from "@/components/ai/generate-copy-button";
import {
  COMPONENT_FIELDS,
  COMPONENT_TYPE_LABELS,
  defaultContentFor,
  type ComponentType,
} from "@/lib/pages/componentFields";
import type { PageDetailDTO, ComponentDTO } from "@/lib/pages/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

const COMPONENT_TYPES = Object.keys(COMPONENT_FIELDS) as ComponentType[];

function ComponentEditor({
  organizationId,
  pageId,
  component,
  audiences,
  onChanged,
}: {
  organizationId: string;
  pageId: string;
  component: ComponentDTO;
  audiences: AudienceDTO[];
  onChanged: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () => component.defaultContent as Record<string, string>,
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(
        `/api/organizations/${organizationId}/pages/${pageId}/components/${component.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultContent: values }),
        },
      );
      setDirty(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await fetch(`/api/organizations/${organizationId}/pages/${pageId}/components/${component.id}`, {
      method: "DELETE",
    });
    onChanged();
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {COMPONENT_TYPE_LABELS[component.type as ComponentType]}
        </h3>
        <div className="flex items-center gap-3">
          <GenerateCopyButton
            organizationId={organizationId}
            componentId={component.id}
            type={component.type as ComponentType}
            onApproved={onChanged}
          />
          <button onClick={remove} className="text-xs text-muted underline underline-offset-2">
            Delete
          </button>
        </div>
      </div>

      <ComponentFormFields
        type={component.type as ComponentType}
        values={values}
        onChange={(key, value) => {
          setValues((v) => ({ ...v, [key]: value }));
          setDirty(true);
        }}
      />

      <Button
        type="button"
        variant="secondary"
        className="mt-3"
        disabled={!dirty || saving}
        onClick={save}
      >
        {saving ? "Saving…" : "Save default content"}
      </Button>

      <PersonalizeSection
        organizationId={organizationId}
        pageId={pageId}
        component={component}
        audiences={audiences}
        onChanged={onChanged}
      />
    </div>
  );
}

function AddComponentForm({
  organizationId,
  pageId,
  onAdded,
}: {
  organizationId: string;
  pageId: string;
  onAdded: () => void;
}) {
  const [type, setType] = useState<ComponentType>("HERO");
  const [saving, setSaving] = useState(false);

  async function add() {
    setSaving(true);
    try {
      await fetch(`/api/organizations/${organizationId}/pages/${pageId}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, defaultContent: defaultContentFor(type) }),
      });
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ComponentType)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
      >
        {COMPONENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {COMPONENT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <Button type="button" disabled={saving} onClick={add}>
        {saving ? "Adding…" : "Add component"}
      </Button>
    </div>
  );
}

export function PageEditor({
  organizationId,
  pageId,
  initialPage,
  initialAudiences,
}: {
  organizationId: string;
  pageId: string;
  initialPage: PageDetailDTO;
  initialAudiences: AudienceDTO[];
}) {
  const [page, setPage] = useState<PageDetailDTO | null>(initialPage);
  const [audiences, setAudiences] = useState<AudienceDTO[]>(initialAudiences);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Refresh after a mutation — not called on mount, since the server
  // component already supplied initial data (avoids both a loading flash
  // and a setState-in-effect-on-mount).
  const load = useCallback(async () => {
    const [pageRes, audiencesRes] = await Promise.all([
      fetch(`/api/organizations/${organizationId}/pages/${pageId}`),
      fetch(`/api/organizations/${organizationId}/audiences`),
    ]);
    const pageData = await pageRes.json();
    const audiencesData = await audiencesRes.json();
    setPage(pageData.page);
    setAudiences(audiencesData.audiences ?? []);
  }, [organizationId, pageId]);

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/pages/${pageId}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data.error ?? "Couldn't publish.");
        return;
      }
      await load();
    } finally {
      setPublishing(false);
    }
  }

  if (!page) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{page.name}</p>
          <p className="text-xs text-muted">
            /{page.slug} · {page.isPublished ? "Published" : "Draft — not yet published"}
          </p>
          {publishError ? <p className="mt-1 text-xs text-danger">{publishError}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {page.isPublished ? (
            <a
              href={`/p/${page.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted underline underline-offset-2"
            >
              View live
            </a>
          ) : null}
          <Button type="button" disabled={publishing} onClick={publish}>
            {publishing ? "Publishing…" : page.isPublished ? "Publish changes" : "Publish"}
          </Button>
        </div>
      </div>

      {page.components.map((component) => (
        <ComponentEditor
          // Remounts (resetting local form state) when defaultContent
          // changes from outside — e.g. an approved AI copy proposal —
          // without fighting typed-in-progress edits the rest of the time.
          key={`${component.id}:${JSON.stringify(component.defaultContent)}`}
          organizationId={organizationId}
          pageId={pageId}
          component={component}
          audiences={audiences}
          onChanged={load}
        />
      ))}

      <AddComponentForm organizationId={organizationId} pageId={pageId} onAdded={load} />
    </div>
  );
}
