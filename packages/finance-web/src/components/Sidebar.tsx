import { NavLink, useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/accounts", icon: Wallet, label: "Accounts" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
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
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
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
                  ? "bg-primary/10 text-primary"
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
          {!isCollapsed && (
            <span className="text-lg font-thin text-foreground">fin</span>
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
        <SheetContent side="left" className="w-[240px] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex items-center h-14 px-4">
            <span className="text-lg font-thin text-foreground">fin</span>
          </div>
          <div className="py-4">
            <NavItems isCollapsed={false} onNavClick={onCloseMobile} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
