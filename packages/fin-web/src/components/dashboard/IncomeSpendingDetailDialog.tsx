import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchTransactions, updateTransaction } from "@/api/transactions";
import { fetchAccounts } from "@/api/accounts";
import { fetchCategories } from "@/api/categories";
import type { Transaction, Account, Category } from "@derekentringer/shared/finance";
import { TRANSFER_CATEGORY } from "@derekentringer/shared/finance";
import { formatCurrency } from "@/lib/chartTheme";

interface IncomeSpendingDetailDialogProps {
  periodDate: string;
  granularity: "weekly" | "monthly";
  incomeFilter: "all" | "sources";
  onClose: () => void;
}

/**
 * Replicate the backend's local-timezone bucketing key for a transaction date.
 * The backend uses `Date.getMonth()`/`getFullYear()` (local time) to assign
 * transactions to month keys like "2025-04", and Monday-based week keys.
 */
function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toWeekKey(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

function dateToKey(d: Date, granularity: "weekly" | "monthly"): string {
  return granularity === "monthly" ? toMonthKey(d) : toWeekKey(d);
}

/**
 * Compute a generous date range to query transactions, then rely on
 * client-side `dateToKey` filtering to match the backend's bucketing exactly.
 * We fetch a few extra days on each side to handle timezone boundary cases.
 */
function computeDateRange(
  periodDate: string,
  granularity: "weekly" | "monthly",
): { startDate: string; endDate: string } {
  if (granularity === "weekly") {
    const start = new Date(periodDate + "T00:00:00");
    // Pad 1 day before and after to catch timezone edge cases
    const queryStart = new Date(start);
    queryStart.setDate(queryStart.getDate() - 1);
    const queryEnd = new Date(start);
    queryEnd.setDate(queryEnd.getDate() + 8);
    return {
      startDate: queryStart.toISOString(),
      endDate: queryEnd.toISOString(),
    };
  }
  // monthly: periodDate is "YYYY-MM"
  const [year, month] = periodDate.split("-").map(Number);
  // Pad 1 day before and after to catch timezone edge cases
  const queryStart = new Date(year, month - 1, 0); // day before month start
  const queryEnd = new Date(year, month, 2); // day after month end
  return {
    startDate: queryStart.toISOString(),
    endDate: queryEnd.toISOString(),
  };
}

function formatPeriodTitle(
  periodDate: string,
  granularity: "weekly" | "monthly",
): string {
  if (granularity === "weekly") {
    const start = new Date(periodDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `Week of ${fmt(start)} – ${fmt(end)}`;
  }
  return new Date(periodDate + "-15").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function TransactionTable({
  label,
  transactions,
  accountMap,
  categories,
  onCategoryChange,
  colorClass,
}: {
  label: string;
  transactions: Transaction[];
  accountMap: Map<string, string>;
  categories: Category[];
  onCategoryChange: (transactionId: string, category: string | null) => void;
  colorClass: string;
}) {
  const total = Math.round(
    transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) * 100,
  ) / 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-sm font-semibold ${colorClass}`}>{label}</h3>
        <span className={`text-sm font-semibold ${colorClass}`}>
          {formatCurrency(total)}
        </span>
      </div>
      {transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No transactions</p>
      ) : (
        <div className="overflow-auto max-h-[35vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(t.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{t.description}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {accountMap.get(t.accountId) ?? "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.category || "__none__"}
                      onValueChange={(v) =>
                        onCategoryChange(t.id, v === "__none__" ? null : v)
                      }
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">
                    {formatCurrency(Math.abs(t.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function IncomeSpendingDetailDialog({
  periodDate,
  granularity,
  incomeFilter,
  onClose,
}: IncomeSpendingDetailDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const title = formatPeriodTitle(periodDate, granularity);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { startDate, endDate } = computeDateRange(periodDate, granularity);

        // Fetch all transactions for the period (paginate to avoid truncation)
        const PAGE_SIZE = 500;
        const firstPage = await fetchTransactions({ startDate, endDate, limit: PAGE_SIZE });
        let allTx = firstPage.transactions;
        const total = firstPage.total;
        while (allTx.length < total) {
          if (cancelled) return;
          const next = await fetchTransactions({
            startDate,
            endDate,
            limit: PAGE_SIZE,
            offset: allTx.length,
          });
          allTx = allTx.concat(next.transactions);
          if (next.transactions.length === 0) break;
        }

        const [acctResult, catResult] = await Promise.all([
          fetchAccounts(),
          fetchCategories(),
        ]);
        if (cancelled) return;
        setAllTransactions(allTx);
        setAccounts(acctResult.accounts);
        setCategories(catResult.categories);
      } catch {
        if (!cancelled) setError("Failed to load transactions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [periodDate, granularity, incomeFilter]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const excludedAccountIds = useMemo(() => {
    if (incomeFilter !== "sources") return new Set<string>();
    return new Set(
      accounts.filter((a) => a.excludeFromIncomeSources).map((a) => a.id),
    );
  }, [accounts, incomeFilter]);

  async function handleCategoryChange(transactionId: string, category: string | null) {
    setAllTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId ? { ...t, category: category ?? undefined } : t,
      ),
    );
    try {
      await updateTransaction(transactionId, { category });
    } catch {
      // Revert on failure — re-fetch would be heavy, so just reload
      setError("Failed to update category");
    }
  }

  const { income, spending } = useMemo(() => {
    const inc: Transaction[] = [];
    const spend: Transaction[] = [];

    for (const t of allTransactions) {
      // Filter to only transactions that bucket into this period,
      // matching the backend's local-timezone dateToKey logic exactly
      const key = dateToKey(new Date(t.date), granularity);
      if (key !== periodDate) continue;

      if ((t.category || "Uncategorized") === TRANSFER_CATEGORY) continue;
      if (excludedAccountIds.has(t.accountId)) continue;

      if (t.amount >= 0) {
        inc.push(t);
      } else {
        spend.push(t);
      }
    }

    inc.sort((a, b) => b.amount - a.amount);
    spend.sort((a, b) => a.amount - b.amount);

    return { income: inc, spending: spend };
  }, [allTransactions, granularity, periodDate, excludedAccountIds]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <div className="space-y-6">
            <TransactionTable
              label="Income"
              transactions={income}
              accountMap={accountMap}
              categories={categories}
              onCategoryChange={handleCategoryChange}
              colorClass="text-emerald-400"
            />
            <TransactionTable
              label="Spending"
              transactions={spending}
              accountMap={accountMap}
              categories={categories}
              onCategoryChange={handleCategoryChange}
              colorClass="text-red-400"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
