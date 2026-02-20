import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  NetWorthResponse,
  NetWorthHistoryPoint,
  ChartTimeRange,
  ChartGranularity,
} from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency, getCategoryColor } from "@/lib/chartTheme";
import { fetchNetWorth } from "@/api/dashboard";
import { TimeRangeSelector } from "./TimeRangeSelector";

type NetWorthView = "overview" | "assets" | "liabilities";

interface NetWorthCardProps {
  data: NetWorthResponse;
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

export function NetWorthCard({ data }: NetWorthCardProps) {
  const [range, setRange] = useState<ChartTimeRange>("12m");
  const [granularity, setGranularity] = useState<ChartGranularity>("weekly");
  const [view, setView] = useState<NetWorthView>("overview");
  const [history, setHistory] = useState<NetWorthHistoryPoint[]>(data.history);
  const [accountHistory, setAccountHistory] = useState<Array<{ date: string; balances: Record<string, number> }>>(data.accountHistory ?? []);
  const [loading, setLoading] = useState(false);

  const refetchHistory = useCallback(async (r: ChartTimeRange, g: ChartGranularity) => {
    setLoading(true);
    try {
      const result = await fetchNetWorth(r, g);
      setHistory(result.history);
      setAccountHistory(result.accountHistory ?? []);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when range or granularity changes (skip initial render — data already loaded)
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      return;
    }
    refetchHistory(range, granularity);
  }, [range, granularity, refetchHistory, initialized]);

  const chartData = useMemo(
    () =>
      history.map((point) => ({
        ...point,
        label: formatLabel(point.date, granularity),
        tooltipLabel: formatTooltipLabel(point.date, granularity),
      })),
    [history, granularity],
  );

  // Build per-account chart data for assets/liabilities views
  const filteredAccounts = useMemo(() => {
    if (view === "overview") return [];
    const classification = view === "assets" ? "asset" : "liability";
    return data.summary.accounts.filter((a) => a.classification === classification);
  }, [view, data.summary.accounts]);

  const accountChartData = useMemo(() => {
    if (view === "overview" || filteredAccounts.length === 0) return [];
    return accountHistory.map((point) => {
      const entry: Record<string, unknown> = {
        label: formatLabel(point.date, granularity),
        tooltipLabel: formatTooltipLabel(point.date, granularity),
      };
      for (const acct of filteredAccounts) {
        entry[acct.id] = point.balances[acct.id] ?? 0;
      }
      return entry;
    });
  }, [view, accountHistory, filteredAccounts, granularity]);

  const assetAccounts = data.summary.accounts
    .filter((a) => a.classification === "asset")
    .sort((a, b) => b.balance - a.balance);
  const liabilityAccounts = data.summary.accounts
    .filter((a) => a.classification === "liability")
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  function accountTrend(
    balance: number,
    previousBalance: number | undefined,
    invertColor = false,
  ): { direction: "up" | "down" | "neutral"; value: string; invertColor?: boolean } | undefined {
    if (previousBalance === undefined) return { direction: "neutral", value: "0.0%" };
    if (previousBalance === 0 && balance === 0) return { direction: "neutral", value: "0.0%" };
    if (previousBalance === 0) return undefined;
    const pct = ((balance - previousBalance) / Math.abs(previousBalance)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral", value: "0.0%" };
    return {
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
      invertColor,
    };
  }

  function trendColorClass(t: { direction: "up" | "down" | "neutral"; invertColor?: boolean }): string {
    const isPositive = t.invertColor ? t.direction === "down" : t.direction === "up";
    const isNegative = t.invertColor ? t.direction === "up" : t.direction === "down";
    if (isPositive) return "bg-success/10 text-success";
    if (isNegative) return "bg-destructive/10 text-destructive";
    return "bg-white/10 text-foreground/70";
  }

  const assetsTrend = useMemo(() => {
    const currentTotal = data.summary.totalAssets;
    let prevTotal = 0;
    let hasPrev = false;
    for (const acct of data.summary.accounts) {
      if (acct.classification !== "asset" || acct.previousBalance === undefined) continue;
      hasPrev = true;
      prevTotal += acct.previousBalance;
    }
    if (!hasPrev || prevTotal === 0) return undefined;
    const pct = ((currentTotal - prevTotal) / Math.abs(prevTotal)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%" };
    return {
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
    };
  }, [data.summary]);

  const liabilitiesTrend = useMemo(() => {
    const currentTotal = data.summary.totalLiabilities;
    let prevTotal = 0;
    let hasPrev = false;
    for (const acct of data.summary.accounts) {
      if (acct.classification !== "liability" || acct.previousBalance === undefined) continue;
      hasPrev = true;
      prevTotal += Math.abs(acct.previousBalance);
    }
    if (!hasPrev || prevTotal === 0) return undefined;
    const pct = ((currentTotal - prevTotal) / Math.abs(prevTotal)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%" };
    // Liabilities going down is good (green), going up is bad (red)
    return {
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
      invertColor: true,
    };
  }, [data.summary]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Net Worth</h2>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              {(["overview", "assets", "liabilities"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
                    view === v
                      ? "bg-foreground/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                  )}
                >
                  {v === "overview" ? "Overview" : v === "assets" ? "Assets" : "Liabilities"}
                </button>
              ))}
            </div>
            <TimeRangeSelector
              range={range}
              granularity={granularity}
              onRangeChange={setRange}
              onGranularityChange={setGranularity}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("transition-opacity", loading && "opacity-40")}>
          {view === "overview" ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.assets} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={CHART_COLORS.assets} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradLiabilities" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.liabilities} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={CHART_COLORS.liabilities} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradNetWorth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.netWorth} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={CHART_COLORS.netWorth} stopOpacity={0} />
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
                dataKey="assets"
                name="Assets"
                stroke={CHART_COLORS.assets}
                fill="url(#gradAssets)"
                fillOpacity={1}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="liabilities"
                name="Liabilities"
                stroke={CHART_COLORS.liabilities}
                fill="url(#gradLiabilities)"
                fillOpacity={1}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="netWorth"
                name="Net Worth"
                stroke={CHART_COLORS.netWorth}
                fill="url(#gradNetWorth)"
                fillOpacity={1}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
          ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={accountChartData}>
              <defs>
                {filteredAccounts.map((acct, i) => (
                  <linearGradient key={acct.id} id={`gradAcct-${acct.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={getCategoryColor(i)} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={getCategoryColor(i)} stopOpacity={0} />
                  </linearGradient>
                ))}
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
              {filteredAccounts.map((acct, i) => (
                <Area
                  key={acct.id}
                  type="monotone"
                  dataKey={acct.id}
                  name={acct.name}
                  stroke={getCategoryColor(i)}
                  fill={`url(#gradAcct-${acct.id})`}
                  fillOpacity={1}
                  strokeWidth={1.5}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {assetAccounts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-bold text-foreground">Assets</h3>
                {assetsTrend && (
                  <>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        trendColorClass(assetsTrend),
                      )}
                    >
                      {assetsTrend.direction === "up" ? "\u2191" : assetsTrend.direction === "down" ? "\u2193" : "\u2192"} {assetsTrend.value}
                    </span>
                    <span className="text-xs text-muted-foreground">vs last month</span>
                  </>
                )}
              </div>
              <div>
                {assetAccounts.slice(0, 5).map((acct, i) => {
                  const trend = accountTrend(acct.balance, acct.previousBalance);
                  return (
                    <div
                      key={acct.id}
                      className={cn(
                        "flex justify-between items-center text-sm px-2 py-0.5 rounded",
                        i % 2 === 0 && "bg-white/[0.03]",
                      )}
                    >
                      <span className="text-foreground truncate mr-2">
                        {acct.name}
                      </span>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-success">
                          {formatCurrency(acct.balance)}
                        </span>
                        {trend && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium",
                              trendColorClass(trend),
                            )}
                          >
                            {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192"} {trend.value}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {liabilityAccounts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-bold text-foreground">Liabilities</h3>
                {liabilitiesTrend && (
                  <>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        trendColorClass(liabilitiesTrend),
                      )}
                    >
                      {liabilitiesTrend.direction === "up" ? "\u2191" : liabilitiesTrend.direction === "down" ? "\u2193" : "\u2192"} {liabilitiesTrend.value}
                    </span>
                    <span className="text-xs text-muted-foreground">vs last month</span>
                  </>
                )}
              </div>
              <div>
                {liabilityAccounts.slice(0, 5).map((acct, i) => {
                  const trend = accountTrend(Math.abs(acct.balance), acct.previousBalance !== undefined ? Math.abs(acct.previousBalance) : undefined, true);
                  return (
                    <div
                      key={acct.id}
                      className={cn(
                        "flex justify-between items-center text-sm px-2 py-0.5 rounded",
                        i % 2 === 0 && "bg-white/[0.03]",
                      )}
                    >
                      <span className="text-foreground truncate mr-2">
                        {acct.name}
                      </span>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-destructive">
                          {formatCurrency(Math.abs(acct.balance))}
                        </span>
                        {trend && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium",
                              trendColorClass(trend),
                            )}
                          >
                            {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192"} {trend.value}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
