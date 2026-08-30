import { LayoutDashboard, Globe, Target, Users, Eye, BarChart3, Plug, Settings, Lightbulb, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Single source of truth for both Sidebar (grouped, with icons) and
// TopBar (flat, for the breadcrumb label lookup) — kept in one place so
// the two can't drift. The old Page/Campaign hosting model (superseded —
// see docs/roadmap.md) was retired outright rather than left reachable
// with no nav entry; Audiences is real, current, load-bearing
// infrastructure (used by personalization, recommendations, and full-
// experience generation) and belongs here for that reason, not as a
// leftover.
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "General",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/sites", label: "Sites", icon: Globe },
      { href: "/audiences", label: "Audiences", icon: Target },
      { href: "/visitors", label: "Visitors", icon: Users },
      { href: "/live-view", label: "Live View", icon: Eye },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
