import { useState, useRef, useEffect } from "react";
import type { TagInfo } from "@derekentringer/shared/ns";

const MAX_COLLAPSED_ROWS = 3;

interface TagBrowserProps {
  tags: TagInfo[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  onRenameTag: (oldName: string, newName: string) => void;
  onDeleteTag: (name: string) => void;
}

export function TagBrowser({
  tags,
  activeTags,
  onToggleTag,
  onRenameTag,
  onDeleteTag,
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
  const [collapsedHeight, setCollapsedHeight] = useState<number | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Measure full height vs collapsed height (MAX_COLLAPSED_ROWS of pill height ~24px + 4px gap)
    const rowHeight = 24 + 4; // pill height + gap
    const maxHeight = rowHeight * MAX_COLLAPSED_ROWS;
    setCollapsedHeight(maxHeight);
    setIsOverflowing(el.scrollHeight > maxHeight + 4);
  }, [tags]);

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

  return (
    <div>
      <div
        ref={wrapRef}
        className="flex flex-wrap gap-1 overflow-hidden transition-all"
        style={
          !expanded && isOverflowing && collapsedHeight
            ? { maxHeight: collapsedHeight }
            : undefined
        }
      >
        {tags.map((tag) => {
          const isActive = activeTags.includes(tag.name);

          if (renaming === tag.name) {
            return (
              <input
                key={tag.name}
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
                className="px-2 py-0.5 rounded-full text-xs bg-input border border-ring text-foreground focus:outline-none w-20"
              />
            );
          }

          return (
            <button
              key={tag.name}
              onClick={() => onToggleTag(tag.name)}
              onContextMenu={(e) => handleContextMenu(e, tag.name)}
              className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                isActive
                  ? "bg-primary text-black"
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

      {isOverflowing && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs text-muted-foreground hover:text-foreground mt-1"
        >
          {expanded ? "show less" : "show more"}
        </button>
      )}

      {activeTags.length > 0 && (
        <button
          onClick={() => activeTags.forEach((t) => onToggleTag(t))}
          className="text-xs text-muted-foreground hover:text-foreground mt-1"
        >
          Clear filter
        </button>
      )}

      {contextMenu && (
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
              className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
              onClick={() => startRename(contextMenu.tag)}
            >
              Rename
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
              onClick={() => handleDeleteTag(contextMenu.tag)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
