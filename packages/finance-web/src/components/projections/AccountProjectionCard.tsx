import { useState, useMemo } from "react";
import type { AccountProjectionLine } from "@derekentringer/shared/finance";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

type Months = 6 | 12 | 24;

const MONTHS_OPTIONS: { value: Months; label: string }[] = [
  { value: 6, label: "6M" },
  { value: 12, label: "12M" },
  { value: 24, label: "24M" },
];

function formatMonthLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function formatTooltipLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
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

interface AccountProjectionCardProps {
  account: AccountProjectionLine;
  loading?: boolean;
}

export function AccountProjectionCard({ account, loading }: AccountProjectionCardProps) {
  const [months, setMonths] = useState<Months>(12);

  const chartData = useMemo(() => {
    return account.projection.slice(0, months).map((point) => ({
      ...point,
      month: formatMonthLabel(point.month),
      tooltipLabel: formatTooltipLabel(point.month),
    }));
  }, [account.projection, months]);

  const trend = useMemo(() => {
    if (account.monthlyChange === 0) return undefined;
    const pct = account.currentBalance !== 0
      ? (account.monthlyChange / Math.abs(account.currentBalance)) * 100
      : 0;
    return {
      direction: account.monthlyChange >= 0 ? ("up" as const) : ("down" as const),
      value: `${formatCurrency(Math.abs(account.monthlyChange))}/mo`,
      pct: Math.abs(pct) >= 0.05 ? `${Math.abs(pct).toFixed(1)}%` : undefined,
    };
  }, [account.monthlyChange, account.currentBalance]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl text-foreground">{account.accountName}</h2>
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  trend.direction === "up"
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {trend.direction === "up" ? "\u2191" : "\u2193"} {trend.value}
              </span>
            )}
          </div>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {MONTHS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMonths(opt.value)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
                  opt.value === months
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("transition-opacity", loading && "opacity-40")}>
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
                name="Projected Balance"
                stroke={CHART_COLORS.balance}
                fill={CHART_COLORS.balance}
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
