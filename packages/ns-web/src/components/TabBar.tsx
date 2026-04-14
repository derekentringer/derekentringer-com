import { useRef, useEffect, useState, useCallback } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useDndMonitor } from "@dnd-kit/core";
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
  onCreate?: () => void;
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
      className={`group relative flex items-center gap-1.5 min-w-[120px] max-w-[200px] px-3 py-1.5 text-sm transition-colors shrink-0 cursor-pointer ${
        isActive
          ? "bg-card text-foreground"
          : "bg-background text-muted-foreground hover:bg-accent"
      }`}
    >
      <span className={`truncate flex-1 text-left pl-[5px] ${tab.isPreview ? "italic" : ""}`}>
        {tab.isDirty && <span className="text-primary mr-1">●</span>}
        {tab.title || "Untitled"}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onCloseTab(tab.id);
        }}
        className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground text-xs leading-none cursor-pointer ${
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

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onPinTab, onCreate }: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });
  const [isDraggingTab, setIsDraggingTab] = useState(false);

  // Update indicator position when active tab changes
  const updateIndicator = useCallback(() => {
    if (!activeTabId || !containerRef.current) return;
    const activeEl = containerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement | null;
    if (activeEl) {
      setIndicator({ left: activeEl.offsetLeft, width: activeEl.offsetWidth, visible: true });
      activeEl.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
    } else {
      setIndicator((prev) => ({ ...prev, visible: false }));
    }
  }, [activeTabId]);

  useDndMonitor({
    onDragStart: () => setIsDraggingTab(true),
    onDragEnd: () => {
      setIsDraggingTab(false);
      requestAnimationFrame(() => requestAnimationFrame(updateIndicator));
    },
    onDragCancel: () => {
      setIsDraggingTab(false);
      requestAnimationFrame(() => requestAnimationFrame(updateIndicator));
    },
  });

  useEffect(() => {
    // Double-RAF to ensure layout is fully settled after render
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(updateIndicator);
    });
    // Also recalculate after fonts finish loading
    document.fonts?.ready?.then(updateIndicator);
    // Staggered recalcs to catch post-navigation layout shifts
    const t1 = setTimeout(updateIndicator, 50);
    const t2 = setTimeout(updateIndicator, 200);
    const t3 = setTimeout(updateIndicator, 500);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, tabs.length, updateIndicator, tabs.find((t) => t.id === activeTabId)?.isDirty]);

  // ResizeObserver: recalculate indicator whenever tab container or parent layout changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateIndicator());
    observer.observe(container);
    // Also observe the parent to catch sidebar/ribbon layout shifts
    if (container.parentElement) observer.observe(container.parentElement);
    return () => observer.disconnect();
  }, [updateIndicator]);

  // Scroll to end when a new tab is added
  const prevTabCount = useRef(tabs.length);
  useEffect(() => {
    if (tabs.length > prevTabCount.current && containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
    prevTabCount.current = tabs.length;
  }, [tabs.length]);

  return (
    <div
      ref={containerRef}
      className="relative flex border-b border-border bg-background overflow-x-auto shrink-0"
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
      {/* New note button — flows after tabs, sticks to right when overflowing */}
      {onCreate && (
        <div className="sticky right-0 shrink-0 flex items-center px-1.5 bg-background">
          <button
            onClick={onCreate}
            className="w-6 h-6 flex items-center justify-center rounded bg-subtle text-sm text-muted-foreground hover:text-primary hover:bg-foreground/10 transition-colors cursor-pointer"
            title="New note"
            aria-label="New note"
          >
            +
          </button>
        </div>
      )}
      {/* Sliding indicator */}
      {indicator.visible && !isDraggingTab && (
        <div
          className="absolute top-0 h-0.5 bg-primary transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
    </div>
  );
}
