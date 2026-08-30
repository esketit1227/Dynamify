"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const body = { email: form.get("email") };

    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <>
        <h1 className="mb-1 text-lg font-semibold text-foreground">Check your email</h1>
        <p className="text-sm text-muted">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-foreground underline underline-offset-2"
        >
          Back to log in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-foreground">Reset your password</h1>
      <p className="mb-6 text-sm text-muted">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required maxLength={255} />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
          Back to log in
        </Link>
      </p>
    </>
  );
}
