import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useSidebar } from "@/hooks/useSidebar";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";

export function AppLayout() {
  const { isCollapsed, isMobileOpen, toggleCollapsed, toggleMobile, closeMobile } =
    useSidebar();

  // Poll for new notifications and show browser popups
  useBrowserNotifications();

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <Sidebar
          isCollapsed={isCollapsed}
          isMobileOpen={isMobileOpen}
          onToggleCollapsed={toggleCollapsed}
          onCloseMobile={closeMobile}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <Header onMenuClick={toggleMobile} />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
