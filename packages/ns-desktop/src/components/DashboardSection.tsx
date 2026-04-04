import type { ReactNode } from "react";

interface DashboardSectionProps {
  title: string;
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
}

export function DashboardSection({
  title,
  children,
  emptyMessage,
  isEmpty,
}: DashboardSectionProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-2">{title}</h2>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">{emptyMessage || "Nothing here yet."}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>{children}</div>
      )}
    </div>
  );
}
