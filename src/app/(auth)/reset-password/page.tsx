"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }

    setLoading(true);
    const form = new FormData(event.currentTarget);
    const body = { token, password: form.get("password") };

    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }

      router.push("/login");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="mb-1 text-lg font-semibold text-foreground">Invalid link</h1>
        <p className="mb-6 text-sm text-muted">
          This password reset link is missing or malformed. Request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-foreground underline underline-offset-2"
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-foreground">Set a new password</h1>
      <p className="mb-6 text-sm text-muted">This will sign you out everywhere else.</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />

        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
