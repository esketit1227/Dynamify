"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";

// A real, computed breadcrumb — the current section's label, looked up
// from the same NAV_ITEMS the sidebar renders, not a hardcoded string per
// page. No search bar, no notification bell: neither has any real
// backing function in this app, and a decorative dead input is exactly
// the "generic AI dashboard" smell CLAUDE.md warns against. The settings
// shortcut is a real, working link.
export function TopBar() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => pathname?.startsWith(item.href));

  return (
    <div className="flex items-center justify-between border-b border-border px-8 py-3.5">
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <span>Dashboard</span>
        {current ? (
          <>
            <span>/</span>
            <span className="font-medium text-foreground">{current.label}</span>
          </>
        ) : null}
      </div>
      <Link
        href="/settings"
        title="Settings"
        aria-label="Settings"
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
      >
        <Settings size={17} />
      </Link>
    </div>
  );
}
