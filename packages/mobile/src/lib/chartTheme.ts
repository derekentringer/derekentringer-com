export const CHART_COLORS = {
  assets: "#22c55e",
  liabilities: "#ef4444",
  netWorth: "#2563eb",
  grid: "#1e2028",
  text: "#999999",
  income: "#22c55e",
  expenses: "#ef4444",
  balance: "#f59e0b",
} as const;

export const CATEGORY_COLORS = [
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#a855f7", // purple
  "#0ea5e9", // sky
  "#e11d48", // rose
  "#10b981", // emerald
  "#eab308", // yellow
] as const;

export function getCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
