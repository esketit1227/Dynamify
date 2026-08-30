import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

// The deliberate 404 path for a stale bookmark, a shared link to
// something since removed, or another org's id (see .../sites/[siteId]
// and .../pages/[pageId]/edit's notFound() calls) — rendered inside the
// normal dashboard shell via Next's not-found convention, not the generic
// (dashboard)/error.tsx boundary, which is for real failures, not "this
// doesn't exist."
export default function DashboardNotFound() {
  return (
    <EmptyState
      title="Not found"
      description="This page doesn't exist, or you no longer have access to it — it may have been removed, or the link is out of date."
      action={
        <Link href="/overview" className="text-sm font-medium text-foreground underline underline-offset-2">
          Back to Overview
        </Link>
      }
    />
  );
}
