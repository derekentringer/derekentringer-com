import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  IncomeSpendingResponse,
  ChartTimeRange,
} from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { fetchIncomeSpending } from "@/api/dashboard";
import { TimeRangeSelector } from "./TimeRangeSelector";
import { IncomeSpendingDetailDialog } from "./IncomeSpendingDetailDialog";

type Granularity = "weekly" | "monthly";
type IncomeFilter = "all" | "sources";

function formatLabel(date: string, granularity: Granularity): string {
  if (granularity === "weekly") {
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return new Date(date + "-15").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function formatTooltipLabel(date: string, granularity: Granularity): string {
  if (granularity === "weekly") {
    return "Week of " + new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return new Date(date + "-15").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const tooltipLabel = (payload[0]?.payload?.tooltipLabel as string) ?? "";
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {sorted.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

interface IncomeSpendingCardProps {
  data: IncomeSpendingResponse;
}

export function IncomeSpendingCard({ data }: IncomeSpendingCardProps) {
  const [range, setRange] = useState<ChartTimeRange>("12m");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [incomeFilter, setIncomeFilter] = useState<IncomeFilter>("sources");
  const [points, setPoints] = useState(data.points);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  const refetch = useCallback(async (r: ChartTimeRange, g: Granularity, f: IncomeFilter) => {
    setLoading(true);
    try {
      const result = await fetchIncomeSpending(r, g, f);
      setPoints(result.points);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      return;
    }
    refetch(range, granularity, incomeFilter);
  }, [range, granularity, incomeFilter, refetch, initialized]);

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        label: formatLabel(point.date, granularity),
        tooltipLabel: formatTooltipLabel(point.date, granularity),
      })),
    [points, granularity],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl text-foreground">Income vs Spending</h2>
            <TabSwitcher
              options={[
                { value: "sources" as const, label: "Acct Filtered" },
                { value: "all" as const, label: "All" },
              ]}
              value={incomeFilter}
              onChange={setIncomeFilter}
              size="sm"
            />
          </div>
          <TimeRangeSelector
            range={range}
            granularity={granularity}
            onRangeChange={setRange}
            onGranularityChange={(g) => {
              if (g === "weekly" || g === "monthly") setGranularity(g);
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("transition-opacity", loading && "opacity-40")}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
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
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)" }} />
              <Bar
                dataKey="income"
                name="Income"
                fill={CHART_COLORS.income}
                stackId="stack"
                radius={[0, 0, 0, 0]}
                style={{ cursor: "pointer" }}
                onClick={(data) => {
                  const date = (data as unknown as Record<string, unknown>)?.date;
                  if (typeof date === "string") setSelectedPeriod(date);
                }}
              />
              <Bar
                dataKey="spending"
                name="Spending"
                fill={CHART_COLORS.expenses}
                stackId="stack"
                radius={[2, 2, 0, 0]}
                style={{ cursor: "pointer" }}
                onClick={(data) => {
                  const date = (data as unknown as Record<string, unknown>)?.date;
                  if (typeof date === "string") setSelectedPeriod(date);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
      {selectedPeriod && (
        <IncomeSpendingDetailDialog
          periodDate={selectedPeriod}
          granularity={granularity}
          incomeFilter={incomeFilter}
          onClose={() => setSelectedPeriod(null)}
        />
      )}
    </Card>
  );
}
