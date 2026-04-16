import { useState, useMemo, useRef, useEffect } from "react";
import { parseFrontmatter, type FrontmatterData } from "@derekentringer/ns-shared";

export type PropertiesMode = "panel" | "source";

interface PropertiesPanelProps {
  content: string;
  onFieldChange: (field: string, value: unknown) => void;
  mode: PropertiesMode;
  onModeChange: (mode: PropertiesMode) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  allTags: string[];
  /** When true, fields are not editable (e.g. trash view, preview mode) */
  readOnly?: boolean;
}

export function PropertiesPanel({
  content,
  onFieldChange,
  mode,
  onModeChange,
  collapsed,
  onToggleCollapsed,
  allTags,
  readOnly = false,
}: PropertiesPanelProps) {
  const { metadata, unknownFields } = useMemo(
    () => parseFrontmatter(content),
    [content],
  );

  if (mode === "source") return null;

  return (
    <div className="border-b border-border">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-1">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title={collapsed ? "Expand properties" : "Collapse properties"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Properties
        </button>
        <div className="flex-1" />
        <button
          onClick={() => onModeChange("source")}
          className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors cursor-pointer"
          title="Edit raw YAML"
        >
          {"</>"}
        </button>
      </div>

      {/* Fields */}
      {!collapsed && (
        <div className="px-3 pb-2 space-y-1">
          {/* Tags */}
          <PropertyRow label="tags">
            <TagPills
              tags={metadata.tags ?? []}
              allTags={allTags}
              onChange={(tags) => onFieldChange("tags", tags.length > 0 ? tags : undefined)}
              readOnly={readOnly}
            />
          </PropertyRow>

          {/* Description */}
          {(metadata.description !== undefined || !readOnly) && (
            <PropertyRow label="description">
              {readOnly ? (
                <span className="text-xs text-foreground">{metadata.description ?? ""}</span>
              ) : (
                <input
                  type="text"
                  value={metadata.description ?? ""}
                  onChange={(e) => onFieldChange("description", e.target.value || undefined)}
                  placeholder="Add a description..."
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
              )}
            </PropertyRow>
          )}

          {/* Aliases */}
          {metadata.aliases && metadata.aliases.length > 0 && (
            <PropertyRow label="aliases">
              <div className="flex flex-wrap gap-1">
                {metadata.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center px-1.5 py-0 rounded text-[11px] bg-border text-muted-foreground"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            </PropertyRow>
          )}

          {/* Favorite */}
          {metadata.favorite !== undefined && (
            <PropertyRow label="favorite">
              <button
                onClick={() => !readOnly && onFieldChange("favorite", !metadata.favorite || undefined)}
                className={`cursor-pointer text-xs ${metadata.favorite ? "text-yellow-500" : "text-muted-foreground/50 hover:text-yellow-500"} transition-colors`}
                disabled={readOnly}
                title={metadata.favorite ? "Unfavorite" : "Favorite"}
              >
                {metadata.favorite ? "\u2605" : "\u2606"}
              </button>
            </PropertyRow>
          )}

          {/* Date fields (read-only) */}
          {metadata.date && (
            <PropertyRow label="created">
              <span className="text-[11px] text-muted-foreground">
                {formatDate(metadata.date)}
              </span>
            </PropertyRow>
          )}
          {metadata.updated && (
            <PropertyRow label="modified">
              <span className="text-[11px] text-muted-foreground">
                {formatDate(metadata.updated)}
              </span>
            </PropertyRow>
          )}

          {/* Unknown fields */}
          {Object.keys(unknownFields).length > 0 && (
            <>
              {Object.entries(unknownFields).map(([key, value]) => (
                <PropertyRow key={key} label={key}>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {typeof value === "string"
                      ? value
                      : JSON.stringify(value)}
                  </span>
                </PropertyRow>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[11px] text-muted-foreground w-16 shrink-0 pt-0.5 text-right">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function TagPills({
  tags,
  allTags,
  onChange,
  readOnly,
}: {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  readOnly: boolean;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = input.trim()
    ? allTags
        .filter(
          (t) =>
            t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t),
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    if (!showSuggestions) return;
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.parentElement?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSuggestions]);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
    setShowSuggestions(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 relative">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[11px] bg-border text-muted-foreground"
        >
          {tag}
          {!readOnly && (
            <button
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="ml-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label={`Remove tag ${tag}`}
            >
              &times;
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <div className="relative flex-1 min-w-[60px]">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (input.trim()) addTag(input);
              } else if (e.key === "Backspace" && !input && tags.length > 0) {
                onChange(tags.slice(0, -1));
              }
            }}
            placeholder={tags.length === 0 ? "Add tags..." : ""}
            className="w-full bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none py-0"
            aria-label="Add tag"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[120px]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="w-full text-left px-3 py-1 text-[11px] text-foreground hover:bg-accent transition-colors cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
