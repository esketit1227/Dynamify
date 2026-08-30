"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred. Try again, or come back in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground"
      >
        Try again
      </button>
    </div>
  );
}
