import { LayoutDashboard, Globe, Target, Users, Eye, BarChart3, Plug, Settings, Lightbulb, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Single source of truth for both Sidebar (grouped, with icons) and
// TopBar (flat, for the breadcrumb label lookup) — kept in one place so
// the two can't drift.
//
// Grouped around what a marketer is actually deciding, not the underlying
// data model (docs/launch-plan.md §5A): nine flat, same-weight items used
// to make "Audiences," "Visitors," and "Recommendations" read as three
// unrelated tools, when they're really three views onto one question —
// who's arriving, and what should they see. Routes are unchanged (no link,
// bookmark, or test depends on a URL moving) — only the grouping and
// labels changed, so this is presentation, not a data-layer merge.
// Audiences/Recommendations/Analytics/Live View now sit together under
// "Experiences"; Sites/Integrations sit together under "Website" (a
// customer typically has one). A full page-level merge (one hub instead
// of four routes) is the natural next step, not done here.
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Home",
    items: [{ href: "/overview", label: "Home", icon: LayoutDashboard }],
  },
  {
    label: "Experiences",
    items: [
      { href: "/audiences", label: "Audiences", icon: Target },
      { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
      { href: "/visitors", label: "Visitors", icon: Users },
      { href: "/live-view", label: "Live View", icon: Eye },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/sites", label: "Sites", icon: Globe },
      { href: "/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
