"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import type { DomainDTO } from "@/lib/domains/service";

export function DomainsManager({
  organizationId,
  initialDomains,
}: {
  organizationId: string;
  initialDomains: DomainDTO[];
}) {
  const [domains, setDomains] = useState(initialDomains);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  async function add() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't add domain.");
        return;
      }
      setDomains((d) => [data.domain, ...d]);
      setHostname("");
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function verify(domainId: string) {
    setVerifyingId(domainId);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/domains/${domainId}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setDomains((ds) => ds.map((d) => (d.id === domainId ? data.domain : d)));
      }
    } finally {
      setVerifyingId(null);
    }
  }

  async function remove(domainId: string) {
    await fetch(`/api/organizations/${organizationId}/domains/${domainId}`, { method: "DELETE" });
    setDomains((ds) => ds.filter((d) => d.id !== domainId));
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Custom domains</h2>
      <p className="mb-3 text-xs text-muted">
        Point a domain you own at a published page. Verification checks for a real DNS TXT record —
        there&apos;s nothing to verify against until you actually own and configure one.
      </p>

      <FormError message={error} />

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="pages.example.com"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
        />
        <Button type="button" disabled={saving || !hostname} onClick={add}>
          Add
        </Button>
      </div>

      {domains.length === 0 ? (
        <p className="text-xs text-muted">No domains added yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {domains.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{d.hostname}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    d.verifiedAt ? "border-accent text-accent" : "border-border text-muted"
                  }`}
                >
                  {d.verifiedAt ? "Verified" : "Unverified"}
                </span>
              </div>
              {!d.verifiedAt ? (
                <p className="mt-2 text-xs text-muted">
                  Add a TXT record at this hostname with value:{" "}
                  <code className="rounded bg-background px-1 py-0.5">{d.verificationToken}</code>
                </p>
              ) : null}
              <div className="mt-2 flex gap-3 text-xs">
                <button
                  onClick={() => verify(d.id)}
                  disabled={verifyingId === d.id}
                  className="text-foreground underline underline-offset-2"
                >
                  {verifyingId === d.id ? "Checking…" : "Check verification"}
                </button>
                <button
                  onClick={() => remove(d.id)}
                  className="text-muted underline underline-offset-2"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
