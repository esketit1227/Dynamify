"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { NAV_GROUPS } from "@/components/dashboard/nav-items";

export function Sidebar({
  organizationName,
  userEmail,
}: {
  organizationName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-5">
        {collapsed ? null : (
          <div className="min-w-0">
            <span className="text-sm font-semibold tracking-tight text-foreground">Dynamify</span>
            <p className="mt-0.5 truncate text-xs text-muted">{organizationName}</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 space-y-5 px-3 py-4" aria-label="Primary">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {collapsed ? null : (
              <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-wide text-muted uppercase">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-background text-foreground"
                        : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                  >
                    <Icon size={17} strokeWidth={2} className="shrink-0" />
                    {collapsed ? null : item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-4">
        {collapsed ? (
          <button
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="flex w-full items-center justify-center rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <>
            <p className="truncate text-xs text-muted">{userEmail}</p>
            <button
              onClick={onLogout}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground underline underline-offset-2"
            >
              <LogOut size={12} />
              Log out
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
