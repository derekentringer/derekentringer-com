import { useState, useEffect, useRef, useCallback } from "react";
import type {
  NetIncomeProjectionResponse,
  AccountProjectionsResponse,
  AccountProjectionLine,
} from "@derekentringer/shared/finance";
import { classifyAccountType, INCOME_SOURCE_FREQUENCY_LABELS } from "@derekentringer/shared/finance";
import { fetchNetIncomeProjection, fetchAccountProjections } from "@/api/projections.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, getCategoryColor, formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { AccountProjectionCard } from "./AccountProjectionCard";

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

function toMonthly(amount: number, freq: string): number {
  switch (freq) {
    case "weekly": return amount * 52 / 12;
    case "biweekly": return amount * 26 / 12;
    case "monthly": return amount;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    default: return amount;
  }
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
  // Sort by value descending for readability
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md max-h-80 overflow-y-auto">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {sorted.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetIncomeTab() {
  const [assetMonths, setAssetMonths] = useState<Months>(12);
  const [liabMonths, setLiabMonths] = useState<Months>(12);
  const effectiveMonths = Math.max(assetMonths, liabMonths);
  const incomeAdj = 0;
  const expenseAdj = 0;
  const [data, setData] = useState<NetIncomeProjectionResponse | null>(null);
  const [accountData, setAccountData] = useState<AccountProjectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(
    (m: number, iAdj: number, eAdj: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        const params = { months: m, incomeAdj: iAdj, expenseAdj: eAdj };

        Promise.all([
          fetchNetIncomeProjection(params, controller.signal),
          fetchAccountProjections(params, controller.signal),
        ])
          .then(([netRes, acctRes]) => {
            setData(netRes);
            setAccountData(acctRes);
            setLoading(false);
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError("Failed to load projection data");
            setLoading(false);
          });
      }, 300);
    },
    [],
  );

  useEffect(() => {
    loadData(effectiveMonths, incomeAdj, expenseAdj);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [effectiveMonths, incomeAdj, expenseAdj, loadData]);

  // Split accounts into assets and liabilities
  const assetAccounts: AccountProjectionLine[] = [];
  const liabilityAccounts: AccountProjectionLine[] = [];
  if (accountData) {
    for (const acct of accountData.accounts) {
      const cls = classifyAccountType(acct.accountType);
      if (cls === "liability") {
        liabilityAccounts.push(acct);
      } else {
        assetAccounts.push(acct);
      }
    }
  }

  // Pivot into Recharts-friendly format — separate datasets per chart
  function pivotChartData(accounts: AccountProjectionLine[], includeOverall: boolean, monthsLimit: number) {
    if (!accountData) return null;
    return accountData.overall.slice(0, monthsLimit).map((point, i) => {
      const row: Record<string, string | number> = {
        month: formatMonthLabel(point.month),
        tooltipLabel: formatTooltipLabel(point.month),
      };
      for (const acct of accounts) {
        row[acct.accountName] = acct.projection[i]?.balance ?? 0;
      }
      if (includeOverall) {
        row.Overall = point.balance;
      }
      return row;
    });
  }

  const assetChartData = pivotChartData(assetAccounts, true, assetMonths);
  const liabilityChartData = pivotChartData(liabilityAccounts, false, liabMonths);

  // Derive favorited non-savings accounts for projection charts
  const SAVINGS_TYPES = ["savings", "high_yield_savings"];
  const favoriteNonSavingsAccounts = accountData
    ? accountData.accounts
        .filter((a) => a.isFavorite && !SAVINGS_TYPES.includes(a.accountType))
    : [];

  // Compute overall current balance from account data
  const overallBalance = accountData
    ? accountData.overall[0]?.balance ?? 0
    : 0;

  const hasNoIncomeData =
    data &&
    data.monthlyIncome === 0 &&
    data.detectedIncome.length === 0 &&
    data.manualIncome.length === 0;

  if (!loading && hasNoIncomeData) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">
            Import transactions or add income sources in Settings to get
            started with projections.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive text-center">{error}</p>
            <div className="flex justify-center mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadData(effectiveMonths, incomeAdj, expenseAdj)}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI row */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Overall Balance */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Overall Balance</p>
              <p className="text-2xl font-bold mt-1" style={{ color: CHART_COLORS.overall }}>
                {formatCurrency(overallBalance)}
              </p>
              {accountData && (assetAccounts.length > 0 || liabilityAccounts.length > 0) && (
                <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                  {assetAccounts.map((a) => (
                    <div key={a.accountId} className="flex justify-between">
                      <span className="truncate mr-2">{a.accountName}</span>
                      <span className="shrink-0">{formatCurrency(a.currentBalance)}</span>
                    </div>
                  ))}
                  {liabilityAccounts.map((a) => (
                    <div key={a.accountId} className="flex justify-between">
                      <span className="truncate mr-2">{a.accountName}</span>
                      <span className="shrink-0 text-destructive">-{formatCurrency(a.currentBalance)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monthly Income */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Monthly Income</p>
              <p className="text-2xl font-bold mt-1 text-success">
                {formatCurrency(data.monthlyIncome)}
              </p>
              {(data.manualIncome.length > 0 || data.detectedIncome.length > 0) && (
                <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                  {data.manualIncome.length > 0
                    ? data.manualIncome.map((src) => (
                        <div key={src.id} className="flex justify-between">
                          <span className="truncate mr-2">{src.name}</span>
                          <span className="shrink-0">{formatCurrency(src.amount)} {INCOME_SOURCE_FREQUENCY_LABELS[src.frequency].toLowerCase()}</span>
                        </div>
                      ))
                    : data.detectedIncome.map((p) => (
                        <div key={p.description} className="flex justify-between">
                          <span className="truncate mr-2">{p.description}</span>
                          <span className="shrink-0">{formatCurrency(p.averageAmount)} {INCOME_SOURCE_FREQUENCY_LABELS[p.frequency].toLowerCase()}</span>
                        </div>
                      ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monthly Expenses */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Monthly Expenses</p>
              <p className="text-2xl font-bold mt-1 text-destructive">
                {formatCurrency(data.monthlyExpenses)}
              </p>
              {data.monthlyExpenses > 0 && (
                <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                  {data.monthlyBillTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Bills</span>
                      <span>{formatCurrency(data.monthlyBillTotal)}/mo</span>
                    </div>
                  )}
                  {data.monthlyBudgetTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Budgets</span>
                      <span>{formatCurrency(data.monthlyBudgetTotal)}/mo</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account Balance Projection charts */}
      {loading && !accountData ? (
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-skeleton rounded w-32" />
              <div className="h-[350px] bg-skeleton rounded" />
            </div>
          </CardContent>
        </Card>
      ) : accountData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Assets chart */}
          {assetChartData && assetAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl text-foreground">Assets</h2>
                  <div className="flex items-center rounded-md border border-border overflow-hidden">
                    {MONTHS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAssetMonths(opt.value)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
                          opt.value === assetMonths
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
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={assetChartData}>
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
                      {assetAccounts.map((acct, i) => (
                        <Area
                          key={acct.accountId}
                          type="monotone"
                          dataKey={acct.accountName}
                          stroke={getCategoryColor(i)}
                          fill={getCategoryColor(i)}
                          fillOpacity={0.1}
                          strokeWidth={1.5}
                        />
                      ))}
                      <Area
                        type="monotone"
                        dataKey="Overall"
                        name="Overall"
                        stroke={CHART_COLORS.overall}
                        fill={CHART_COLORS.overall}
                        fillOpacity={0.15}
                        strokeWidth={3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Liabilities chart */}
          {liabilityChartData && liabilityAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl text-foreground">Liabilities</h2>
                  <div className="flex items-center rounded-md border border-border overflow-hidden">
                    {MONTHS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setLiabMonths(opt.value)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
                          opt.value === liabMonths
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
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={liabilityChartData}>
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
                      {liabilityAccounts.map((acct, i) => (
                        <Area
                          key={acct.accountId}
                          type="monotone"
                          dataKey={acct.accountName}
                          stroke={getCategoryColor(assetAccounts.length + i)}
                          fill={getCategoryColor(assetAccounts.length + i)}
                          fillOpacity={0.1}
                          strokeWidth={1.5}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* Favorite non-savings account projection charts */}
      {favoriteNonSavingsAccounts.map((acct) => (
        <AccountProjectionCard key={acct.accountId} account={acct} loading={loading} />
      ))}
    </div>
  );
}
