import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PerformanceResponse, PerformancePeriod } from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";

interface PerformanceChartProps {
  data: PerformanceResponse;
  period: PerformancePeriod;
  onPeriodChange: (period: PerformancePeriod) => void;
}

const PERIOD_OPTIONS = [
  { value: "1m" as const, label: "1M" },
  { value: "3m" as const, label: "3M" },
  { value: "6m" as const, label: "6M" },
  { value: "12m" as const, label: "12M" },
  { value: "all" as const, label: "ALL" },
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const tooltipLabel = (payload[0]?.payload?.tooltipLabel as string) ?? "";
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrencyFull(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart({ data, period, onPeriodChange }: PerformanceChartProps) {
  const chartData = useMemo(() => {
    return data.series.map((point) => ({
      label: new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      tooltipLabel: new Date(point.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      portfolio: point.portfolioValue,
      benchmark: point.benchmarkValue,
    }));
  }, [data.series]);

  const hasBenchmark = data.series.some((p) => p.benchmarkValue != null);

  if (data.series.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xl text-foreground">Performance</h2>
            <TabSwitcher options={PERIOD_OPTIONS} value={period} onChange={onPeriodChange} size="sm" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No performance data available. Price history will appear as daily prices are fetched.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl text-foreground">Performance</h2>
          <TabSwitcher options={PERIOD_OPTIONS} value={period} onChange={onPeriodChange} size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.netWorth} stopOpacity={0.15} />
                <stop offset="100%" stopColor={CHART_COLORS.netWorth} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBenchmark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.liabilities} stopOpacity={0.15} />
                <stop offset="100%" stopColor={CHART_COLORS.liabilities} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_COLORS.grid}
            />
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
            <Area
              type="monotone"
              dataKey="portfolio"
              name="Portfolio"
              stroke={CHART_COLORS.netWorth}
              fill="url(#gradPortfolio)"
              fillOpacity={1}
              strokeWidth={1.5}
            />
            {hasBenchmark && (
              <Area
                type="monotone"
                dataKey="benchmark"
                name="S&P 500 (SPY)"
                stroke={CHART_COLORS.liabilities}
                fill="url(#gradBenchmark)"
                fillOpacity={1}
                strokeWidth={1.5}
                strokeDasharray="5 5"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
