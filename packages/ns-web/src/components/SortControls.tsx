import type { NoteSortField, SortOrder } from "@derekentringer/shared/ns";

interface SortControlsProps {
  sortBy: NoteSortField;
  sortOrder: SortOrder;
  onSortByChange: (field: NoteSortField) => void;
  onSortOrderChange: (order: SortOrder) => void;
}

const sortFields: { value: NoteSortField; label: string }[] = [
  { value: "sortOrder", label: "Manual" },
  { value: "updatedAt", label: "Modified" },
  { value: "createdAt", label: "Created" },
  { value: "title", label: "Title" },
];

export function SortControls({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: SortControlsProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value as NoteSortField)}
        className="flex-1 px-2 py-0.5 rounded bg-input border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Sort by"
      >
        {sortFields.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
        className="px-1.5 py-0.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title={sortOrder === "asc" ? "Ascending" : "Descending"}
        aria-label={`Sort ${sortOrder === "asc" ? "ascending" : "descending"}`}
      >
        {sortOrder === "asc" ? "\u2191" : "\u2193"}
      </button>
    </div>
  );
}
