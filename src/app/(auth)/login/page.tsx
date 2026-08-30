"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const body = { email: form.get("email"), password: form.get("password") };

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }

      router.push("/overview");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-foreground">Log in</h1>
      <p className="mb-6 text-sm text-muted">Welcome back.</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required maxLength={255} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="mb-1.5 text-xs text-muted underline underline-offset-2">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" required />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-2">
          Sign up
        </Link>
      </p>
    </>
  );
}
