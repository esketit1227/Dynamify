"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { EmptyState } from "@/components/ui/empty-state";
import type { WebhookDTO } from "@/lib/integrations/service";

const EVENT_TYPES = [
  "PAGE_VIEW",
  "PERSONALIZATION_IMPRESSION",
  "CTA_CLICK",
  "FORM_START",
  "FORM_SUBMIT",
  "CONVERSION",
];

export function WebhooksManager({
  organizationId,
  initialWebhooks,
}: {
  organizationId: string;
  initialWebhooks: WebhookDTO[];
}) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>(["CONVERSION"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  function toggleEventType(type: string) {
    setEventTypes((types) =>
      types.includes(type) ? types.filter((t) => t !== type) : [...types, type],
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, eventTypes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create webhook.");
        return;
      }
      setWebhooks((w) => [data.webhook, ...w]);
      setNewSecret(data.webhook.signingSecret);
      setCreating(false);
      setUrl("");
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/organizations/${organizationId}/webhooks/${id}`, { method: "DELETE" });
    setWebhooks((w) => w.filter((wh) => wh.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {newSecret ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
          <p className="font-medium text-foreground">Signing secret (shown once)</p>
          <code className="mt-1 block break-all text-xs text-foreground">{newSecret}</code>
          <p className="mt-2 text-xs text-muted">
            Use this to verify the <code>X-Dynamify-Signature</code> header (HMAC-SHA256 of the
            request body). It won&apos;t be shown again.
          </p>
          <button
            onClick={() => setNewSecret(null)}
            className="mt-2 text-xs text-muted underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {creating ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <FormError message={error} />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Endpoint URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/dynamify"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Events</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={eventTypes.includes(type)}
                    onChange={() => toggleEventType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={saving || !url || eventTypes.length === 0} onClick={save}>
              {saving ? "Creating…" : "Create webhook"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setCreating(true)}>New webhook</Button>
      )}

      {webhooks.length === 0 && !creating ? (
        <EmptyState
          title="No integrations yet"
          description="Add a webhook to receive personalization and conversion events in your own systems."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {webhooks.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{w.url}</p>
                <p className="text-xs text-muted">{w.eventTypes.join(", ")}</p>
              </div>
              <button
                onClick={() => remove(w.id)}
                className="text-xs text-muted underline underline-offset-2"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
