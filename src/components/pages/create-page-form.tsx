"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreatePageForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New page</Button>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push(`/pages/${data.page.id}/edit`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <FormError message={error} />
      <div>
        <Label htmlFor="page-name">Page name</Label>
        <Input
          id="page-name"
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div>
        <Label htmlFor="page-slug">Slug</Label>
        <Input
          id="page-slug"
          value={slug}
          required
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugEdited(true);
          }}
        />
        <p className="mt-1 text-xs text-muted">Publishes to {slug || "your-slug"}.yourdomain.app</p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
