import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { HysVsDebtMonthPoint } from "@derekentringer/shared/finance";
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
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

interface HysVsDebtChartProps {
  schedule: HysVsDebtMonthPoint[];
  breakEvenMonth: number | null;
}

export function HysVsDebtChart({ schedule, breakEvenMonth }: HysVsDebtChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={schedule}>
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
        <Line
          type="monotone"
          dataKey="scenarioA_netPosition"
          name="Keep HYS"
          stroke={CHART_COLORS.scenarioA}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="scenarioB_netPosition"
          name="Pay Down Loan"
          stroke={CHART_COLORS.scenarioB}
          strokeWidth={2}
          dot={false}
        />
        {breakEvenMonth !== null && (
          <ReferenceLine
            x={schedule[breakEvenMonth]?.label}
            stroke={CHART_COLORS.text}
            strokeDasharray="4 4"
            label={{
              value: `Break-even: Month ${breakEvenMonth}`,
              position: "top",
              fill: CHART_COLORS.text,
              fontSize: 11,
            }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
