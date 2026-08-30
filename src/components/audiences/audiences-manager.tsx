"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { EmptyState } from "@/components/ui/empty-state";
import { AudienceRuleEditor, type RuleRow } from "@/components/audiences/audience-rule-editor";
import { GenerateAudiencesButton } from "@/components/ai/generate-audiences-button";
import type { AudienceDetailDTO, AudienceDTO } from "@/lib/audiences/dto";

function coerceValue(operator: string, raw: string): unknown {
  if (operator === "IN") {
    return raw.split(",").map((v) => v.trim()).filter(Boolean);
  }
  if (operator === "EXISTS") return raw.trim().toLowerCase() !== "false";
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function valueToString(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function emptyForm() {
  return { name: "", description: "", rules: [] as RuleRow[] };
}

export function AudiencesManager({
  organizationId,
  initialAudiences,
}: {
  organizationId: string;
  initialAudiences: AudienceDTO[];
}) {
  const [audiences, setAudiences] = useState<AudienceDTO[]>(initialAudiences);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Refresh after a mutation — initial data came from the server component.
  async function load() {
    const res = await fetch(`/api/organizations/${organizationId}/audiences`);
    const data = await res.json();
    setAudiences(data.audiences ?? []);
  }

  async function startEdit(id: string) {
    const res = await fetch(`/api/organizations/${organizationId}/audiences/${id}`);
    const data = await res.json();
    const audience = data.audience as AudienceDetailDTO;
    setForm({
      name: audience.name,
      description: audience.description ?? "",
      rules: audience.rules.map((r) => ({
        field: r.field,
        operator: r.operator,
        value: valueToString(r.value),
        groupIndex: r.groupIndex,
      })),
    });
    setEditingId(id);
    setCreating(false);
    setError(null);
  }

  function startCreate() {
    setForm(emptyForm());
    setCreating(true);
    setEditingId(null);
    setError(null);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        rules: form.rules.map((r) => ({
          field: r.field,
          operator: r.operator,
          value: coerceValue(r.operator, r.value),
          groupIndex: r.groupIndex,
        })),
      };

      const url = editingId
        ? `/api/organizations/${organizationId}/audiences/${editingId}`
        : `/api/organizations/${organizationId}/audiences`;

      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }

      cancel();
      await load();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/organizations/${organizationId}/audiences/${id}`, { method: "DELETE" });
    await load();
  }

  const editorOpen = creating || editingId !== null;

  return (
    <div className="flex flex-col gap-6">
      {editorOpen ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <FormError message={error} />
          <div>
            <Label htmlFor="audience-name">Name</Label>
            <Input
              id="audience-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="audience-description">Description</Label>
            <Input
              id="audience-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <AudienceRuleEditor
            rules={form.rules}
            onChange={(rules) => setForm((f) => ({ ...f, rules }))}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={saving || !form.name} onClick={save}>
              {saving ? "Saving…" : "Save audience"}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button onClick={startCreate}>New audience</Button>
          <GenerateAudiencesButton organizationId={organizationId} onApproved={load} />
        </div>
      )}

      {audiences.length === 0 && !editorOpen ? (
        <EmptyState
          title="No audiences yet"
          description="Create one to start targeting content — e.g. 'Returning visitors' or 'Paid LinkedIn traffic'. Then personalize a content element on a connected site for it."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {audiences.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted">
                  {a.ruleCount} {a.ruleCount === 1 ? "condition" : "conditions"}
                  {a.description ? ` · ${a.description}` : ""}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() => startEdit(a.id)}
                  className="text-foreground underline underline-offset-2"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="text-muted underline underline-offset-2"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
