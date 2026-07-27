import {
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  FileText,
  House,
  Puzzle,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

export const primaryNavigation: readonly NavigationItem[] = [
  { href: "/overview", icon: House, label: "Overview" },
  { href: "/opportunities", icon: Search, label: "Opportunities" },
  { href: "/content", icon: FileText, label: "Content" },
  { href: "/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/publications", icon: BriefcaseBusiness, label: "Publications" },
  { href: "/analytics", icon: ChartNoAxesColumnIncreasing, label: "Analytics" },
  { href: "/integrations", icon: Puzzle, label: "Integrations" },
] as const;

export const secondaryNavigation: readonly NavigationItem[] = [
  { href: "/settings", icon: Settings, label: "Settings" },
  { href: "/help", icon: CircleHelp, label: "Help & support" },
] as const;
