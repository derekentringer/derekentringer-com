import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "./table";

interface SortableTableHeadProps<T extends string> {
  field: T;
  label: string;
  sortField: T | null;
  sortDir: "asc" | "desc";
  onSort: (field: T) => void;
  className?: string;
}

export function SortableTableHead<T extends string>({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = "",
}: SortableTableHeadProps<T>) {
  const isActive = sortField === field;
  const Icon = isActive
    ? sortDir === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${isActive ? "text-foreground" : ""}`}
        onClick={() => onSort(field)}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}
