import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  AccountBalanceHistoryResponse,
  ChartTimeRange,
  ChartGranularity,
} from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { fetchAccountBalanceHistory } from "@/api/dashboard";
import { TimeRangeSelector } from "./TimeRangeSelector";

interface AccountBalanceCardProps {
  accountId: string;
}

function formatLabel(date: string, granularity: ChartGranularity): string {
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

function formatTooltipLabel(date: string, granularity: ChartGranularity): string {
  if (granularity === "weekly") {
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
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
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function AccountBalanceCard({ accountId }: AccountBalanceCardProps) {
  const [range, setRange] = useState<ChartTimeRange>("all");
  const [granularity, setGranularity] = useState<ChartGranularity>("weekly");
  const [data, setData] = useState<AccountBalanceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (r: ChartTimeRange, g: ChartGranularity) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAccountBalanceHistory(accountId, r, g);
      setData(result);
    } catch {
      setError("Failed to load balance history");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load(range, granularity);
  }, [range, granularity, load]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.history.map((point) => ({
      ...point,
      label: formatLabel(point.date, granularity),
      tooltipLabel: formatTooltipLabel(point.date, granularity),
    }));
  }, [data, granularity]);

  const trend = useMemo(() => {
    if (!data || data.history.length < 2) return undefined;
    const current = data.history[data.history.length - 1].balance;
    const previous = data.history[data.history.length - 2].balance;
    const trendLabel = granularity === "weekly" ? "vs last week" : "vs last month";
    if (previous === 0) return { direction: "neutral" as const, value: "0.0%", label: trendLabel };
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%", label: trendLabel };
    return {
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
      label: trendLabel,
    };
  }, [data, granularity]);

  if (error && !data) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-destructive mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => load(range, granularity)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data && loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-skeleton rounded w-32" />
            <div className="bg-skeleton rounded h-[350px]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl text-foreground">{data.accountName}</h2>
            {trend && (
              <>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    trend.direction === "up"
                      ? "bg-success/10 text-success"
                      : trend.direction === "down"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-white/10 text-foreground/70",
                  )}
                >
                  {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192"} {trend.value}
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </>
            )}
          </div>
          <TimeRangeSelector
            range={range}
            granularity={granularity}
            onRangeChange={setRange}
            onGranularityChange={setGranularity}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("transition-opacity", loading && "opacity-40")}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.balance} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={CHART_COLORS.balance} stopOpacity={0} />
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
                dataKey="balance"
                name="Balance"
                stroke={CHART_COLORS.balance}
                fill="url(#gradBalance)"
                fillOpacity={1}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
