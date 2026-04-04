import type { ReactNode } from "react";

export type SidebarPanel = "explorer" | "search" | "favorites" | "tags";

interface SidebarTabsProps {
  activePanel: SidebarPanel;
  onPanelChange: (panel: SidebarPanel) => void;
  showFavorites: boolean;
}

const tabs: { id: SidebarPanel; label: string; icon: ReactNode }[] = [
  {
    id: "explorer",
    label: "File Explorer",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    id: "favorites",
    label: "Favorites",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    id: "tags",
    label: "Tags",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
];

export function SidebarTabs({ activePanel, onPanelChange, showFavorites }: SidebarTabsProps) {
  const visibleTabs = showFavorites ? tabs : tabs.filter((t) => t.id !== "favorites");

  return (
    <div className="flex items-center border-b border-border shrink-0">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onPanelChange(tab.id)}
          className={`flex-1 flex items-center justify-center py-2 transition-colors cursor-pointer ${
            activePanel === tab.id
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={tab.label}
          aria-label={tab.label}
        >
          {tab.icon}
        </button>
      ))}
    </div>
  );
}
