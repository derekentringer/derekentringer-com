import { useMemo } from "react";
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
import type { NetWorthResponse } from "@derekentringer/shared/finance";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";

interface NetWorthCardProps {
  data: NetWorthResponse;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetWorthCard({ data }: NetWorthCardProps) {
  const chartData = data.history.map((point) => ({
    ...point,
    month: new Date(point.month + "-15").toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
  }));

  const assetAccounts = data.summary.accounts
    .filter((a) => a.classification === "asset")
    .sort((a, b) => b.balance - a.balance);
  const liabilityAccounts = data.summary.accounts
    .filter((a) => a.classification === "liability")
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  function accountTrend(
    balance: number,
    previousBalance: number | undefined,
    invertDirection = false,
  ): { direction: "up" | "down" | "neutral"; value: string } | undefined {
    if (previousBalance === undefined) return { direction: "neutral", value: "0.0%" };
    if (previousBalance === 0 && balance === 0) return { direction: "neutral", value: "0.0%" };
    if (previousBalance === 0) return undefined;
    const pct = ((balance - previousBalance) / Math.abs(previousBalance)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral", value: "0.0%" };
    const direction = invertDirection
      ? pct <= 0 ? ("up" as const) : ("down" as const)
      : pct >= 0 ? ("up" as const) : ("down" as const);
    return { direction, value: `${Math.abs(pct).toFixed(1)}%` };
  }

  const assetsTrend = useMemo(() => {
    if (data.history.length < 2) return undefined;
    const curr = data.history[data.history.length - 1].assets;
    const prev = data.history[data.history.length - 2].assets;
    if (prev === 0) return { direction: "neutral" as const, value: "0.0%" };
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%" };
    return {
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
    };
  }, [data.history]);

  const liabilitiesTrend = useMemo(() => {
    if (data.history.length < 2) return undefined;
    const curr = data.history[data.history.length - 1].liabilities;
    const prev = data.history[data.history.length - 2].liabilities;
    if (prev === 0) return { direction: "neutral" as const, value: "0.0%" };
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%" };
    // Liabilities going down is good (green/up), going up is bad (red/down)
    return {
      direction: pct <= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
    };
  }, [data.history]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl text-foreground">Net Worth</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_COLORS.grid}
            />
            <XAxis
              dataKey="month"
              stroke={CHART_COLORS.text}
              fontSize={12}
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
              fill={CHART_COLORS.assets}
              fillOpacity={0.1}
            />
            <Area
              type="monotone"
              dataKey="liabilities"
              name="Liabilities"
              stroke={CHART_COLORS.liabilities}
              fill={CHART_COLORS.liabilities}
              fillOpacity={0.1}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              name="Net Worth"
              stroke={CHART_COLORS.netWorth}
              fill={CHART_COLORS.netWorth}
              fillOpacity={0.15}
            />
          </AreaChart>
        </ResponsiveContainer>

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
                        assetsTrend.direction === "up"
                          ? "bg-success/10 text-success"
                          : assetsTrend.direction === "down"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-white/10 text-foreground/70",
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
                      <span className="text-muted-foreground truncate mr-2">
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
                              trend.direction === "up"
                                ? "bg-success/10 text-success"
                                : trend.direction === "down"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-white/10 text-foreground/70",
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
                        liabilitiesTrend.direction === "up"
                          ? "bg-success/10 text-success"
                          : liabilitiesTrend.direction === "down"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-white/10 text-foreground/70",
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
                      <span className="text-muted-foreground truncate mr-2">
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
                              trend.direction === "up"
                                ? "bg-success/10 text-success"
                                : trend.direction === "down"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-white/10 text-foreground/70",
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
