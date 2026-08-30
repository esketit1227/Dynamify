"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12">
      <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted">
        This section couldn&apos;t load. Nothing else on your account was affected — try again.
      </p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
