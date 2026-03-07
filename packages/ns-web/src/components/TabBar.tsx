import { useRef, useEffect } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface Tab {
  id: string;
  title: string;
  isDirty: boolean;
  isPreview: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onPinTab?: (tabId: string) => void;
}

interface SortableTabProps {
  tab: Tab;
  isActive: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onPinTab?: (tabId: string) => void;
}

function SortableTab({ tab, isActive, onSelectTab, onCloseTab, onPinTab }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-tab-id={tab.id}
      onClick={() => onSelectTab(tab.id)}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (tab.isPreview) onPinTab?.(tab.id);
      }}
      onMouseDown={(e) => {
        // Middle-click closes tab
        if (e.button === 1) {
          e.preventDefault();
          onCloseTab(tab.id);
        }
      }}
      className={`group relative flex items-center gap-1.5 min-w-[120px] max-w-[200px] px-3 py-1.5 text-sm transition-colors shrink-0 ${
        isActive
          ? "bg-card text-foreground border-t-2 border-primary"
          : "bg-background text-muted-foreground hover:bg-accent border-t-2 border-transparent"
      }`}
    >
      <span className={`truncate flex-1 text-left ${tab.isPreview ? "italic" : ""}`}>
        {tab.isDirty && <span className="text-primary mr-1">●</span>}
        {tab.title || "Untitled"}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onCloseTab(tab.id);
        }}
        className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground text-xs leading-none ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        role="button"
        aria-label={`Close ${tab.title || "Untitled"}`}
      >
        ×
      </span>
    </button>
  );
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onPinTab }: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!activeTabId || !containerRef.current) return;
    const activeEl = containerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeTabId]);

  return (
    <div
      ref={containerRef}
      className="flex border-b border-border bg-background overflow-x-auto shrink-0"
      style={{ scrollbarWidth: "none" }}
    >
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        {tabs.map((tab) => (
          <SortableTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onPinTab={onPinTab}
          />
        ))}
      </SortableContext>
    </div>
  );
}
