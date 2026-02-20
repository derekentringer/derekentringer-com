import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  SavingsAccountSummary,
  SavingsProjectionResponse,
} from "@derekentringer/shared/finance";
import { fetchSavingsProjection } from "@/api/projections.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Check, Clock } from "lucide-react";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

type MonthsOption = 12 | 24 | 60 | 120;

const MONTHS_OPTIONS: { value: MonthsOption; label: string }[] = [
  { value: 12, label: "1yr" },
  { value: 24, label: "2yr" },
  { value: 60, label: "5yr" },
  { value: 120, label: "10yr" },
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
  const total = payload.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
      <p className="font-medium mt-1 border-t border-border pt-1">
        Total: {formatCurrency(total)}
      </p>
    </div>
  );
}

interface SavingsProjectionCardProps {
  account: SavingsAccountSummary;
}

export function SavingsProjectionCard({ account }: SavingsProjectionCardProps) {
  const [months, setMonths] = useState<MonthsOption>(12);
  const [contribution, setContribution] = useState(account.estimatedMonthlyContribution);
  const [apyText, setApyText] = useState(account.apy.toString());
  const [apyNumeric, setApyNumeric] = useState(account.apy);
  const [data, setData] = useState<SavingsProjectionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadProjection = useCallback(
    (m: number, contrib: number, apyVal: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        fetchSavingsProjection(
          account.accountId,
          { months: m, contribution: contrib, apy: apyVal },
          controller.signal,
        )
          .then((res) => {
            setData(res);
            setLoading(false);
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setLoading(false);
          });
      }, 300);
    },
    [account.accountId],
  );

  useEffect(() => {
    loadProjection(months, contribution, apyNumeric);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [months, contribution, apyNumeric, loadProjection]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.projection.map((point) => ({
      ...point,
      month: formatMonthLabel(point.month),
      tooltipLabel: formatTooltipLabel(point.month),
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">{account.accountName}</h2>
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
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Current Balance</p>
            <p className="text-lg font-bold text-violet-500">
              {formatCurrency(account.currentBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">APY</p>
            <p className="text-lg font-bold">{account.apy.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Est. Contribution</p>
            <p className="text-lg font-bold">
              {formatCurrency(account.estimatedMonthlyContribution)}
            </p>
          </div>
        </div>

        {/* Chart + Controls side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart (2/3 width) */}
          <div className="lg:col-span-2">
            {!data && loading ? (
              <div className="animate-pulse">
                <div className="h-[300px] bg-skeleton rounded" />
              </div>
            ) : chartData.length > 0 ? (
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
                      dataKey="principal"
                      name="Principal"
                      stackId="1"
                      stroke={CHART_COLORS.savingsPrincipal}
                      fill={CHART_COLORS.savingsPrincipal}
                      fillOpacity={0.6}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="interest"
                      name="Interest"
                      stackId="1"
                      stroke={CHART_COLORS.savingsInterest}
                      fill={CHART_COLORS.savingsInterest}
                      fillOpacity={0.6}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>

          {/* Adjust Parameters + Milestones (1/3 width) */}
          <div className="space-y-4">
            {/* Adjust Parameters */}
            <div>
              <h3 className="text-sm font-medium mb-3">Adjust Parameters</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Monthly Contribution</Label>
                    <div className="w-24">
                      <Input
                        type="number"
                        min={0}
                        step={50}
                        value={contribution}
                        onChange={(e) =>
                          setContribution(Number(e.target.value) || 0)
                        }
                        className="text-right text-sm h-7"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(5000, contribution * 2)}
                    step={50}
                    value={contribution}
                    onChange={(e) => setContribution(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    3-mo avg: {formatCurrency(account.estimatedMonthlyContribution)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">APY</Label>
                    <div className="flex items-center gap-1 w-24">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={apyText}
                        onChange={(e) => setApyText(e.target.value)}
                        onBlur={() => setApyNumeric(parseFloat(apyText) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setApyNumeric(parseFloat(apyText) || 0);
                        }}
                        className="text-right text-sm h-7"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Milestones */}
            {data && data.milestones.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Milestones</h3>
                <div className="space-y-2">
                  {data.milestones.map((milestone, i) => {
                    const reached = milestone.targetDate !== null;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          {reached ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="text-foreground">
                            {formatCurrency(milestone.targetAmount)}
                          </span>
                        </div>
                        <span
                          className={
                            reached
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {milestone.targetDate
                            ? new Date(
                                milestone.targetDate + "-15",
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                year: "numeric",
                              })
                            : "Beyond"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
