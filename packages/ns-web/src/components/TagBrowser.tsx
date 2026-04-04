import { useState, useRef, useEffect, useMemo } from "react";
import type { TagInfo } from "@derekentringer/shared/ns";

const MAX_COLLAPSED_ROWS = 3;

export type TagLayout = "pills" | "list";
export type TagSort = "count" | "alpha";

interface TagBrowserProps {
  tags: TagInfo[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  onRenameTag: (oldName: string, newName: string) => void;
  onDeleteTag: (name: string) => void;
  layout?: TagLayout;
  sortBy?: TagSort;
  showLayoutToggle?: boolean;
  showSort?: boolean;
  showFilter?: boolean;
}

export function TagBrowser({
  tags,
  activeTags,
  onToggleTag,
  onRenameTag,
  onDeleteTag,
  layout: layoutProp,
  sortBy: sortByProp,
  showLayoutToggle = false,
  showSort = false,
  showFilter = false,
}: TagBrowserProps) {
  const [contextMenu, setContextMenu] = useState<{
    tag: string;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number>(0);
  const [expandedHeight, setExpandedHeight] = useState<number>(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<TagLayout>(() => {
    if (layoutProp) return layoutProp;
    try {
      const stored = localStorage.getItem("ns-tag-layout");
      if (stored === "pills" || stored === "list") return stored;
    } catch {}
    return "list";
  });
  const [sortBy, setSortBy] = useState<TagSort>(() => {
    try {
      const stored = localStorage.getItem("ns-tag-sort");
      if (stored === "count" || stored === "alpha") return stored;
    } catch {}
    return "count";
  });
  const [filter, setFilter] = useState("");

  // Sync controlled props
  useEffect(() => {
    if (layoutProp) setLayout(layoutProp);
  }, [layoutProp]);
  useEffect(() => {
    if (sortByProp) setSortBy(sortByProp);
  }, [sortByProp]);

  // Persist preferences
  useEffect(() => {
    if (!layoutProp) {
      try { localStorage.setItem("ns-tag-layout", layout); } catch {}
    }
  }, [layout, layoutProp]);
  useEffect(() => {
    try { localStorage.setItem("ns-tag-sort", sortBy); } catch {}
  }, [sortBy]);

  const sortedTags = useMemo(() => {
    const sorted = [...tags];
    if (sortBy === "alpha") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }
    return sorted;
  }, [tags, sortBy]);

  const filteredTags = useMemo(() => {
    if (!filter) return sortedTags;
    const lower = filter.toLowerCase();
    return sortedTags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [sortedTags, filter]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || layout !== "pills") return;
    const rowHeight = 24 + 4;
    const maxHeight = rowHeight * MAX_COLLAPSED_ROWS;
    setCollapsedHeight(maxHeight);
    setExpandedHeight(el.scrollHeight);
    setIsOverflowing(el.scrollHeight > maxHeight + 4);
  }, [tags, layout]);

  if (tags.length === 0) return null;

  function handleContextMenu(e: React.MouseEvent, tagName: string) {
    e.preventDefault();
    setContextMenu({ tag: tagName, x: e.clientX, y: e.clientY });
  }

  function startRename(tagName: string) {
    setRenaming(tagName);
    setRenameValue(tagName);
    setContextMenu(null);
  }

  function commitRename() {
    if (renaming && renameValue.trim() && renameValue.trim() !== renaming) {
      onRenameTag(renaming, renameValue.trim());
    }
    setRenaming(null);
    setRenameValue("");
  }

  function handleDeleteTag(tagName: string) {
    setContextMenu(null);
    onDeleteTag(tagName);
  }

  const contextMenuEl = contextMenu && (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setContextMenu(null)}
      />
      <div
        className="fixed z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[120px]"
        style={{ top: contextMenu.y, left: contextMenu.x }}
      >
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
          onClick={() => startRename(contextMenu.tag)}
        >
          Rename
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors cursor-pointer"
          onClick={() => handleDeleteTag(contextMenu.tag)}
        >
          Delete
        </button>
      </div>
    </>
  );

  // Controls bar (sort, layout toggle, clear)
  const controlsBar = (showSort || showLayoutToggle) && (
    <div className="flex items-center gap-1.5 mb-1">
      {showSort && (
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as TagSort)}
          className="appearance-none h-5 pr-4 pl-1.5 py-0 rounded bg-subtle bg-[length:8px_8px] bg-[right_4px_center] bg-no-repeat border-none text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
          aria-label="Sort tags"
        >
          <option value="count">By count</option>
          <option value="alpha">A-Z</option>
        </select>
      )}
      <div className="flex-1" />
      {showLayoutToggle && (
        <button
          onClick={() => setLayout((l) => l === "pills" ? "list" : "pills")}
          className="flex items-center justify-center w-5 h-5 rounded bg-subtle text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={layout === "pills" ? "Switch to list view" : "Switch to pill view"}
          aria-label="Toggle tag layout"
        >
          {layout === "pills" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          )}
        </button>
      )}
    </div>
  );

  // Filter input
  const filterInput = showFilter && (
    <div className="relative mb-1">
      <input
        type="text"
        placeholder="Filter tags..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full py-1 px-2 text-xs bg-input border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {filter && (
        <button
          type="button"
          onClick={() => setFilter("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors text-[10px] cursor-pointer"
          aria-label="Clear filter"
        >
          ✕
        </button>
      )}
    </div>
  );

  // Rename input helper
  function renderRenameInput(tagName: string) {
    return (
      <input
        key={tagName}
        autoFocus
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") {
            setRenaming(null);
            setRenameValue("");
          }
        }}
        className="px-2 py-0.5 rounded-full text-xs bg-input border border-ring text-foreground focus:outline-none w-full"
      />
    );
  }

  // ── List layout ──
  if (layout === "list") {
    return (
      <div>
        {controlsBar}
        {filterInput}
        <div className="flex flex-col">
          {filteredTags.map((tag) => {
            const isActive = activeTags.includes(tag.name);

            if (renaming === tag.name) {
              return <div key={tag.name} className="px-2 py-1">{renderRenameInput(tag.name)}</div>;
            }

            return (
              <button
                key={tag.name}
                onClick={() => onToggleTag(tag.name)}
                onContextMenu={(e) => handleContextMenu(e, tag.name)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors cursor-pointer ${
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                  <span className="truncate">{tag.name}</span>
                </span>
                <span className="text-xs text-muted-foreground opacity-60 shrink-0 ml-2">{tag.count}</span>
              </button>
            );
          })}
          {filteredTags.length === 0 && filter && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No matching tags</div>
          )}
        </div>
        {contextMenuEl}
      </div>
    );
  }

  // ── Pills layout (original) ──
  return (
    <div>
      {controlsBar}
      {filterInput}
      <div className="flex flex-wrap gap-1">
        {filteredTags.map((tag) => {
          const isActive = activeTags.includes(tag.name);

          if (renaming === tag.name) {
            return renderRenameInput(tag.name);
          }

          return (
            <button
              key={tag.name}
              onClick={() => onToggleTag(tag.name)}
              onContextMenu={(e) => handleContextMenu(e, tag.name)}
              className={`px-2 py-0.5 rounded-full text-xs transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-contrast"
                  : "bg-border text-muted-foreground hover:text-foreground"
              }`}
              title={`${tag.name} (${tag.count})`}
            >
              {tag.name}
              <span className="ml-1 opacity-60">{tag.count}</span>
            </button>
          );
        })}
      </div>

      {contextMenuEl}
    </div>
  );
}
