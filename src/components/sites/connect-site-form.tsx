"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";

export function ConnectSiteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't connect that site.");
        return;
      }
      router.push(`/sites/${data.site.id}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <FormError message={error} />
      <div>
        <label className="mb-1 block text-xs font-medium text-muted" htmlFor="site-url">
          Website URL
        </label>
        <Input
          id="site-url"
          type="url"
          placeholder="https://yourcompany.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading || !url} className="self-start">
        {loading ? "Connecting…" : "Connect website"}
      </Button>
    </form>
  );
}
