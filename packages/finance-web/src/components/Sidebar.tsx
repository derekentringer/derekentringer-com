import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Banknote,
  Landmark,
  CreditCard,
  FileText,
  Home,
  LineChart,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccountTypes } from "../context/AccountTypesContext.tsx";
import { FinLogo } from "./FinLogo.tsx";

const SLUG_ICONS: Record<string, LucideIcon> = {
  checking: Banknote,
  savings: Landmark,
  credit: CreditCard,
  loans: FileText,
  "real-estate": Home,
  investments: LineChart,
};

type NavEntry =
  | { type: "link"; to: string; icon: LucideIcon; label: string }
  | { type: "separator" }
  | { type: "group"; icon: LucideIcon; label: string };

const NAV_ITEMS: NavEntry[] = [
  { type: "link", to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { type: "link", to: "/projections", icon: TrendingUp, label: "Projections" },
  { type: "group", icon: Wallet, label: "Accounts" },
  { type: "link", to: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { type: "separator" },
  { type: "link", to: "/budgets", icon: PiggyBank, label: "Budgets" },
  { type: "link", to: "/bills", icon: Receipt, label: "Bills" },
  { type: "link", to: "/goals", icon: Target, label: "Goals" },
  { type: "separator" },
  { type: "link", to: "/reports", icon: BarChart3, label: "Reports" },
  { type: "link", to: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}

function NavItems({
  isCollapsed,
  onNavClick,
}: {
  isCollapsed: boolean;
  onNavClick?: () => void;
}) {
  const location = useLocation();
  const { activeGroups, groupCounts } = useAccountTypes();
  const [accountsOpen, setAccountsOpen] = useState(true);
  const isAccountsActive = location.pathname.startsWith("/accounts/");

  useEffect(() => {
    if (isAccountsActive) setAccountsOpen(true);
  }, [isAccountsActive]);

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item, index) => {
        if (item.type === "separator") {
          return (
            <Separator key={`sep-${index}`} className="my-2" />
          );
        }

        if (item.type === "group") {
          const Icon = item.icon;

          // Collapsed mode: just show the icon with tooltip
          if (isCollapsed) {
            const groupLink = (
              <button
                type="button"
                key="accounts-group"
                className={cn(
                  "flex items-center justify-center rounded-lg px-2 py-2 text-sm transition-colors",
                  isAccountsActive
                    ? "bg-accent text-foreground font-bold"
                    : "text-muted hover:bg-accent hover:text-foreground",
                )}
                onClick={() => {
                  // In collapsed mode, clicking does nothing useful
                }}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </button>
            );

            return (
              <Tooltip key="accounts-group" delayDuration={0}>
                <TooltipTrigger asChild>{groupLink}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          // Expanded mode: collapsible group header + children
          return (
            <div key="accounts-group" className="flex flex-col">
              <button
                type="button"
                onClick={() => setAccountsOpen((prev) => !prev)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full text-left",
                  isAccountsActive
                    ? "bg-accent text-foreground font-bold"
                    : "text-muted hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {accountsOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
              </button>

              {accountsOpen && activeGroups.length > 0 && (
                <div className="flex flex-col gap-0.5 ml-4 mt-0.5">
                  {activeGroups.map((group) => {
                    const ChildIcon = SLUG_ICONS[group.slug] ?? Wallet;
                    const to = `/accounts/${group.slug}`;
                    return (
                      <NavLink
                        key={group.slug}
                        to={to}
                        onClick={onNavClick}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors no-underline hover:no-underline",
                            isActive
                              ? "bg-accent text-foreground font-bold"
                              : "text-muted hover:bg-accent hover:text-foreground",
                          )
                        }
                      >
                        <ChildIcon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{group.label}</span>
                        {groupCounts[group.slug] != null && (
                          <Badge variant="muted" className="ml-auto text-[10px] px-1.5 py-0 h-4 min-w-[1.25rem] justify-center">
                            {groupCounts[group.slug]}
                          </Badge>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        const Icon = item.icon;
        const link = (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavClick}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors no-underline hover:no-underline",
                isActive
                  ? "bg-accent text-foreground font-bold"
                  : "text-muted hover:bg-accent hover:text-foreground",
                isCollapsed && "justify-center px-2",
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span>{item.label}</span>}
          </NavLink>
        );

        if (isCollapsed) {
          return (
            <Tooltip key={item.to} delayDuration={0}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        }

        return link;
      })}
    </nav>
  );
}

export function Sidebar({
  isCollapsed,
  isMobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: SidebarProps) {
  const location = useLocation();

  useEffect(() => {
    onCloseMobile();
  }, [location.pathname, onCloseMobile]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar h-full transition-all duration-300",
          isCollapsed ? "w-(--sidebar-collapsed)" : "w-(--sidebar-width)",
        )}
      >
        <div
          className={cn(
            "flex items-center h-14 px-4",
            isCollapsed ? "justify-center" : "justify-between",
          )}
        >
          {isCollapsed ? (
            <FinLogo className="h-5 w-5" />
          ) : (
            <div className="flex items-center gap-2">
              <FinLogo className="h-5 w-5" />
              <span className="text-lg font-normal text-foreground">fin</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggleCollapsed}
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex-1 py-4">
          <NavItems isCollapsed={isCollapsed} />
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet open={isMobileOpen} onOpenChange={(open) => !open && onCloseMobile()}>
        <SheetContent side="left" className="w-3/4 max-w-[240px] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex items-center gap-2 h-14 px-4">
            <FinLogo className="h-5 w-5" />
            <span className="text-lg font-normal text-foreground">fin</span>
          </div>
          <div className="py-4">
            <NavItems isCollapsed={false} onNavClick={onCloseMobile} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
