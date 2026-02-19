import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  Budget,
  CreateBudgetRequest,
  UpdateBudgetRequest,
  MonthlyBudgetSummaryResponse,
} from "@derekentringer/shared/finance";
import {
  fetchBudgetSummary,
  fetchBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from "@/api/budgets";
import { BudgetForm } from "@/components/BudgetForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, ChevronLeft, ChevronRight, Copy, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_COLORS,
  formatCurrency,
  formatCurrencyFull,
} from "@/lib/chartTheme";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type SortField = "category" | "budgeted" | "actual" | "remaining";
type SortDir = "asc" | "desc";

export function BudgetsPage() {
  const [summary, setSummary] = useState<MonthlyBudgetSummaryResponse | null>(
    null,
  );
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [month, setMonth] = useState(() => getCurrentMonth());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadData = useCallback(async () => {
    try {
      const [summaryData, budgetsData] = await Promise.all([
        fetchBudgetSummary(month),
        fetchBudgets(),
      ]);
      setSummary(summaryData);
      setBudgets(budgetsData.budgets);
      setError("");
    } catch {
      setError("Failed to load budget data");
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [loadData]);

  function navigateMonth(direction: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    setMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  function findBudgetForCategory(categoryName: string): Budget | undefined {
    return budgets.find((b) => b.category === categoryName);
  }

  async function handleCreate(
    data: CreateBudgetRequest | UpdateBudgetRequest,
  ) {
    await createBudget(data as CreateBudgetRequest);
    setShowForm(false);
    await loadData();
  }

  async function handleUpdate(
    data: CreateBudgetRequest | UpdateBudgetRequest,
  ) {
    if (!editBudget) return;
    await updateBudget(editBudget.id, data as UpdateBudgetRequest);
    setEditBudget(null);
    await loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteBudget(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setError("Failed to delete budget");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCopyLastMonth() {
    setIsCopying(true);
    setError("");
    try {
      const prevMonth = getPreviousMonth(month);
      const prevSummary = await fetchBudgetSummary(prevMonth);
      if (prevSummary.categories.length === 0) {
        setError("No budgets found in the previous month to copy.");
        return;
      }
      for (const cat of prevSummary.categories) {
        await createBudget({
          category: cat.category,
          amount: cat.budgeted,
          effectiveFrom: month,
        });
      }
      await loadData();
    } catch {
      setError("Failed to copy budgets from last month");
    } finally {
      setIsCopying(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortField(null);
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedCategories = useMemo(() => {
    if (!summary) return [];
    if (!sortField) return summary.categories;
    return [...summary.categories].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "budgeted":
          cmp = a.budgeted - b.budgeted;
          break;
        case "actual":
          cmp = a.actual - b.actual;
          break;
        case "remaining":
          cmp = a.remaining - b.remaining;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [summary, sortField, sortDir]);

  const chartData =
    summary?.categories.map((cat) => ({
      name: cat.category,
      Budget: cat.budgeted,
      Actual: cat.actual,
    })) ?? [];

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-center text-muted py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl text-foreground">Budgets</h1>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopyLastMonth}
                disabled={isCopying}
              >
                <Copy className="h-4 w-4" />
                {isCopying ? "Copying..." : "Copy Last Month"}
              </Button>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Set Budget
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-error mb-4">{error}</p>}

          <div className="flex items-center justify-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-medium min-w-[180px] text-center">
              {formatMonthLabel(month)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {!summary || summary.categories.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No budgets set. Create your first budget to track spending.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableTableHead field="category" label="Category" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableTableHead field="budgeted" label="Budgeted" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="actual" label="Actual" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="remaining" label="Remaining" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <TableHead className="hidden sm:table-cell">
                    Progress
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCategories.map((cat) => {
                  const pct =
                    cat.budgeted > 0
                      ? Math.min(100, (cat.actual / cat.budgeted) * 100)
                      : 0;
                  const over = cat.actual > cat.budgeted;
                  const budget = findBudgetForCategory(cat.category);
                  const activeSince =
                    cat.effectiveFrom < month ? cat.effectiveFrom : null;

                  return (
                    <TableRow key={cat.category}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-normal">{cat.category}</span>
                          {activeSince && (
                            <Badge variant="muted" className="text-xs">
                              Active since{" "}
                              {formatMonthLabel(activeSince)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyFull(cat.budgeted)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyFull(cat.actual)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${over ? "text-error" : ""}`}
                      >
                        {formatCurrencyFull(cat.remaining)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="w-full bg-muted rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: over
                                ? CHART_COLORS.overBudget
                                : CHART_COLORS.underBudget,
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {budget && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-primary hover:text-primary-hover"
                                onClick={() => setEditBudget(budget)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-error hover:text-destructive-hover"
                                onClick={() => setDeleteTarget(budget)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFull(summary.totalBudgeted)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFull(summary.totalActual)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${summary.totalRemaining < 0 ? "text-error" : ""}`}
                  >
                    {formatCurrencyFull(summary.totalRemaining)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {summary && summary.categories.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-xl text-foreground">Budget vs Actual</h2>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={CHART_COLORS.grid}
                />
                <XAxis
                  type="number"
                  tickFormatter={formatCurrency}
                  stroke={CHART_COLORS.text}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  stroke={CHART_COLORS.text}
                />
                <Tooltip
                  formatter={(value) => formatCurrencyFull(value as number)}
                  contentStyle={{
                    backgroundColor: "#1a1b23",
                    border: "1px solid #2e2f3a",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="Budget"
                  fill={CHART_COLORS.budgetFill}
                  stroke={CHART_COLORS.budget}
                />
                <Bar
                  dataKey="Actual"
                  fill={CHART_COLORS.underBudget}
                  shape={(props) => {
                    const { x, y, width, height, payload } = props as {
                      x: number;
                      y: number;
                      width: number;
                      height: number;
                      payload: { Budget: number; Actual: number };
                    };
                    const over = payload.Actual > payload.Budget;
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={
                          over
                            ? CHART_COLORS.overBudget
                            : CHART_COLORS.underBudget
                        }
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <BudgetForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {editBudget && (
        <BudgetForm
          budget={editBudget}
          onSubmit={handleUpdate}
          onClose={() => setEditBudget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Budget"
          message={`Are you sure you want to delete the budget for "${deleteTarget.category}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}

function SortableTableHead({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = "",
}: {
  field: SortField;
  label: string;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = sortField === field;
  const Icon = isActive
    ? sortDir === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${isActive ? "text-foreground" : ""}`}
        onClick={() => onSort(field)}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}
