import { LayoutDashboard, Globe, Users, Eye, BarChart3, Plug, Settings, Lightbulb, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Single source of truth for both Sidebar (grouped, with icons) and
// TopBar (flat, for the breadcrumb label lookup) — kept in one place so
// the two can't drift. Pages/Campaigns (superseded page-hosting model)
// and Audiences are deliberately not linked here — see docs/roadmap.md.
// Still reachable directly (Settings and the element personalization
// panel both link to /audiences); just not part of the primary nav.
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "General",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/sites", label: "Sites", icon: Globe },
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
