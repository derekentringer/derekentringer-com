// Chart color constants
export const CHART_COLORS = {
  assets: "#22c55e",
  liabilities: "#ef4444",
  netWorth: "#2563eb",
  grid: "#1e2028",
  text: "#999999",
  budget: "#3b82f6",
  budgetFill: "rgba(59, 130, 246, 0.3)",
  overBudget: "#ef4444",
  underBudget: "#22c55e",
  income: "#22c55e",
  expenses: "#ef4444",
  netIncome: "#2563eb",
  balance: "#f59e0b",
  savingsBalance: "#8b5cf6",
  savingsPrincipal: "#3b82f6",
  savingsInterest: "#10b981",
  overall: "#94a3b8",
} as const;

// Category color palette (13 colors, avoids red/green collision with chart colors)
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

interface PathContext {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
}

const STEP_RADIUS = 2;

/** stepAfter curve with 2px rounded corners via quadratic bezier at each step. */
export function curveStepAfterRounded(context: PathContext) {
  let _line = NaN;
  let _x = NaN;
  let _y = NaN;
  let _point = 0;
  let _t = 1;

  return {
    areaStart() { _line = 0; },
    areaEnd() { _line = NaN; },
    lineStart() { _x = _y = NaN; _point = 0; },
    lineEnd() {
      if (0 < _t && _t < 1 && _point === 2) context.lineTo(_x, _y);
      if (_line || (_line !== 0 && _point === 1)) context.closePath();
      if (_line >= 0) { _t = 1 - _t; _line = 1 - _line; }
    },
    point(x: number, y: number) {
      x = +x; y = +y;
      switch (_point) {
        case 0:
          _point = 1;
          if (_line) { context.lineTo(x, y); } else { context.moveTo(x, y); }
          break;
        case 1:
          _point = 2;
          // falls through
        default: {
          const dy = y - _y;
          const r = dy !== 0 ? Math.min(STEP_RADIUS, Math.abs(x - _x) / 2, Math.abs(dy) / 2) : 0;
          const sy = dy > 0 ? 1 : -1;
          const sx = x > _x ? 1 : -1;

          if (_t <= 0) {
            if (r > 0) {
              context.lineTo(_x, y - sy * r);
              context.quadraticCurveTo(_x, y, _x + sx * r, y);
              context.lineTo(x, y);
            } else {
              context.lineTo(_x, y);
              context.lineTo(x, y);
            }
          } else {
            if (r > 0) {
              context.lineTo(x - sx * r, _y);
              context.quadraticCurveTo(x, _y, x, _y + sy * r);
              context.lineTo(x, y);
            } else {
              context.lineTo(x, _y);
              context.lineTo(x, y);
            }
          }
          break;
        }
      }
      _x = x; _y = y;
    },
  };
}

export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
