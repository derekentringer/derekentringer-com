import { useState, useEffect, useRef, useCallback } from "react";
import type {
  NetIncomeProjectionResponse,
  AccountProjectionsResponse,
  AccountProjectionLine,
  IncomeSource,
} from "@derekentringer/shared/finance";
import { INCOME_SOURCE_FREQUENCY_LABELS, classifyAccountType } from "@derekentringer/shared/finance";
import { fetchNetIncomeProjection, fetchAccountProjections } from "@/api/projections.ts";
import { deleteIncomeSource } from "@/api/incomeSources.ts";
import { IncomeSourceForm } from "@/components/IncomeSourceForm.tsx";
import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { CHART_COLORS, getCategoryColor, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";

type Months = 6 | 12 | 24;

function formatMonthLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
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
  // Sort by value descending for readability
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md max-h-80 overflow-y-auto">
      <p className="font-medium mb-1">{label}</p>
      {sorted.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetIncomeTab() {
  const [months, setMonths] = useState<Months>(12);
  const incomeAdj = 0;
  const expenseAdj = 0;
  const [data, setData] = useState<NetIncomeProjectionResponse | null>(null);
  const [accountData, setAccountData] = useState<AccountProjectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IncomeSource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    loadData(months, incomeAdj, expenseAdj);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [months, incomeAdj, expenseAdj, loadData]);

  function handleIncomeSaved() {
    setShowIncomeForm(false);
    setEditingSource(null);
    loadData(months, incomeAdj, expenseAdj);
  }

  async function handleDeleteSource() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteIncomeSource(deleteTarget.id);
      setDeleteTarget(null);
      loadData(months, incomeAdj, expenseAdj);
    } catch {
      setError("Failed to delete income source");
    } finally {
      setIsDeleting(false);
    }
  }

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
  function pivotChartData(accounts: AccountProjectionLine[], includeOverall: boolean) {
    if (!accountData) return null;
    return accountData.overall.map((point, i) => {
      const row: Record<string, string | number> = {
        month: formatMonthLabel(point.month),
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

  const assetChartData = pivotChartData(assetAccounts, true);
  const liabilityChartData = pivotChartData(liabilityAccounts, false);

  // Compute overall current balance from account data
  const overallBalance = accountData
    ? accountData.overall[0]?.balance ?? 0
    : 0;

  const variableSpending = data
    ? Math.max(0, data.monthlyExpenses - data.monthlyBillTotal)
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
            Import transactions to see auto-detected income patterns, or add
            manual income sources to get started.
          </p>
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              onClick={() => setShowIncomeForm(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Income Source
            </Button>
          </div>
          {(showIncomeForm || editingSource) && (
            <IncomeSourceForm
              open={showIncomeForm || !!editingSource}
              onClose={() => {
                setShowIncomeForm(false);
                setEditingSource(null);
              }}
              onSaved={handleIncomeSaved}
              incomeSource={editingSource ?? undefined}
            />
          )}
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
                onClick={() => loadData(months, incomeAdj, expenseAdj)}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeframe selector */}
      <div className="flex gap-2">
        {([6, 12, 24] as Months[]).map((m) => (
          <Button
            key={m}
            variant={months === m ? "default" : "outline"}
            size="sm"
            onClick={() => setMonths(m)}
          >
            {m}mo
          </Button>
        ))}
      </div>

      {/* KPI row */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Overall Balance</p>
              <p className="text-2xl font-bold mt-1" style={{ color: CHART_COLORS.overall }}>
                {formatCurrency(overallBalance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Monthly Income</p>
              <p className="text-2xl font-bold mt-1 text-success">
                {formatCurrency(data.monthlyIncome)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Monthly Expenses</p>
              <p className="text-2xl font-bold mt-1 text-destructive">
                {formatCurrency(data.monthlyExpenses)}
              </p>
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
                <CardTitle>Assets</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={assetChartData}>
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
                    <Legend />
                    {assetAccounts.map((acct, i) => (
                      <Line
                        key={acct.accountId}
                        type="stepAfter"
                        dataKey={acct.accountName}
                        stroke={getCategoryColor(i)}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ))}
                    <Line
                      type="stepAfter"
                      dataKey="Overall"
                      stroke={CHART_COLORS.overall}
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Liabilities chart */}
          {liabilityChartData && liabilityAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Liabilities</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={liabilityChartData}>
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
                    <Legend />
                    {liabilityAccounts.map((acct, i) => (
                      <Line
                        key={acct.accountId}
                        type="stepAfter"
                        dataKey={acct.accountName}
                        stroke={getCategoryColor(assetAccounts.length + i)}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* Two-column grid: Income Sources + Expense Summary */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Income Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Income Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Auto-Detected
                </h4>
                {data.detectedIncome.length > 0 ? (
                  <div className="space-y-2">
                    {data.detectedIncome.map((pattern, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">
                            {pattern.description}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {INCOME_SOURCE_FREQUENCY_LABELS[pattern.frequency]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            ({pattern.occurrences}x)
                          </span>
                        </div>
                        <span className="text-success">
                          {formatCurrencyFull(pattern.monthlyEquivalent)}/mo
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recurring income detected from transactions.
                  </p>
                )}
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Manual Income
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowIncomeForm(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
                {data.manualIncome.length > 0 ? (
                  <div className="space-y-2">
                    {data.manualIncome.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">{source.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {INCOME_SOURCE_FREQUENCY_LABELS[source.frequency]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-success">
                            {formatCurrencyFull(source.amount)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditingSource(source)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-error hover:text-destructive-hover"
                            onClick={() => setDeleteTarget(source)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No manual income sources added.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Expense Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fixed bills</span>
                  <span className="text-foreground">
                    {formatCurrencyFull(data.monthlyBillTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Variable spending
                  </span>
                  <span className="text-foreground">
                    {formatCurrencyFull(variableSpending)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">
                    {formatCurrencyFull(data.monthlyExpenses)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Income Source Form Dialog */}
      {(showIncomeForm || editingSource) && (
        <IncomeSourceForm
          open={showIncomeForm || !!editingSource}
          onClose={() => {
            setShowIncomeForm(false);
            setEditingSource(null);
          }}
          onSaved={handleIncomeSaved}
          incomeSource={editingSource ?? undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Income Source"
          message={`Are you sure you want to delete "${deleteTarget.name}"?`}
          onConfirm={handleDeleteSource}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
