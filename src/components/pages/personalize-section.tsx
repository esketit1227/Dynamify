"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComponentFormFields } from "@/components/pages/component-form-fields";
import type { ComponentType } from "@/lib/pages/componentFields";
import type { ComponentDTO, PersonalizationRuleDTO } from "@/lib/pages/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

export function PersonalizeSection({
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
  const [adding, setAdding] = useState(false);
  const [audienceId, setAudienceId] = useState(audiences[0]?.id ?? "");
  const [priority, setPriority] = useState("0");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addRule() {
    setError(null);
    if (!audienceId) {
      setError("Create an audience first.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/pages/${pageId}/components/${component.id}/personalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audienceId,
            content: values,
            priority: Number(priority) || 0,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }
      setAdding(false);
      setValues({});
      onChanged();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(ruleId: string) {
    await fetch(
      `/api/organizations/${organizationId}/pages/${pageId}/components/${component.id}/personalize/${ruleId}`,
      { method: "DELETE" },
    );
    onChanged();
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Personalize</p>

      {component.personalizationRules.length === 0 ? (
        <p className="mb-2 text-xs text-muted">Everyone sees the default content above.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-2">
          {component.personalizationRules.map((rule: PersonalizationRuleDTO) => (
            <li
              key={rule.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
            >
              <span>
                <strong>{rule.audienceName}</strong> sees a variant (priority {rule.priority})
              </span>
              <button
                onClick={() => removeRule(rule.id)}
                className="text-muted underline underline-offset-2"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Audience</label>
            <select
              value={audienceId}
              onChange={(e) => setAudienceId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {audiences.length === 0 ? <option value="">No audiences yet</option> : null}
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <ComponentFormFields
            type={component.type as ComponentType}
            values={values}
            onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Priority</label>
            <Input value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={saving} onClick={addRule}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          Add audience variant
        </Button>
      )}
    </div>
  );
}
