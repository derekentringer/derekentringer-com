import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { FourOhOneKYearPoint } from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      {sorted.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

interface FourOhOneKChartProps {
  projection: FourOhOneKYearPoint[];
  currentPct: number;
  optimalPct: number;
}

export function FourOhOneKChart({ projection, currentPct, optimalPct }: FourOhOneKChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={projection}>
        <defs>
          <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.fourOhOneKCurrent} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.fourOhOneKCurrent} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradOptimal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.fourOhOneKOptimal} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.fourOhOneKOptimal} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradMax" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.fourOhOneKMax} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_COLORS.fourOhOneKMax} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="label"
          stroke={CHART_COLORS.text}
          fontSize={12}
          interval="equidistantPreserveStart"
        />
        <YAxis
          stroke={CHART_COLORS.text}
          fontSize={12}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Area
          type="monotone"
          dataKey="currentBalance"
          name={`Current (${currentPct}%)`}
          stroke={CHART_COLORS.fourOhOneKCurrent}
          fill="url(#gradCurrent)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="optimalBalance"
          name={`Optimal (${optimalPct}%)`}
          stroke={CHART_COLORS.fourOhOneKOptimal}
          fill="url(#gradOptimal)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="maxBalance"
          name="IRS Max"
          stroke={CHART_COLORS.fourOhOneKMax}
          fill="url(#gradMax)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
