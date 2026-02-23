import { useState, useEffect, useCallback, useMemo } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { Account, Transaction, Category } from "@derekentringer/shared/finance";
import { fetchTransactions, updateTransaction, bulkUpdateCategory } from "../api/transactions.ts";
import { fetchAccounts } from "../api/accounts.ts";
import { fetchCategories } from "../api/categories.ts";
import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

type SortField = "date" | "description" | "amount" | "category" | "account";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("__none__");
  const [isBulkApplying, setIsBulkApplying] = useState(false);

  // Filters
  const [accountId, setAccountId] = useState(searchParams.get("accountId") ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sorting
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        // Third click resets to default (server order)
        setSortField(null);
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedTransactions = useMemo(() => {
    if (!sortField) return transactions;
    return [...transactions].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "description":
          cmp = a.description.localeCompare(b.description);
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "category":
          cmp = (a.category ?? "").localeCompare(b.category ?? "");
          break;
        case "account": {
          const aName = accountMap.get(a.accountId) ?? a.accountId;
          const bName = accountMap.get(b.accountId) ?? b.accountId;
          cmp = aName.localeCompare(bName);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, sortField, sortDir, accountMap]);

  const loadTransactions = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset,
      };
      if (accountId) params.accountId = accountId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (category) params.category = category;
      if (search) params.search = search;

      const result = await fetchTransactions(params as Parameters<typeof fetchTransactions>[0]);
      setTransactions(result.transactions);
      setTotal(result.total);
      setSelected(new Set());
      setBulkCategory("__none__");
      setError("");
    } catch {
      setError("Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  }, [accountId, startDate, endDate, category, search, offset]);

  const loadFilters = useCallback(async () => {
    try {
      const [accts, cats] = await Promise.all([
        fetchAccounts(),
        fetchCategories(),
      ]);
      setAccounts(accts.accounts);
      setCategories(cats.categories);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  function handleFilterChange() {
    setOffset(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const allVisibleIds = sortedTransactions.map((t) => t.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = allVisibleIds.some((id) => selected.has(id));
  const headerChecked = allSelected ? true : someSelected ? ("indeterminate" as const) : false;

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allVisibleIds));
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleBulkApply() {
    if (selected.size === 0) return;
    setIsBulkApplying(true);
    try {
      const category = bulkCategory === "__none__" ? null : bulkCategory;
      await bulkUpdateCategory(Array.from(selected), category);
      setSelected(new Set());
      setBulkCategory("__none__");
      loadTransactions();
    } catch {
      setError("Failed to bulk update category");
    } finally {
      setIsBulkApplying(false);
    }
  }

  if (isLoading && transactions.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-center text-muted py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Transactions</h1>
        <Button size="sm" onClick={() => setShowImport(true)} disabled={accounts.length === 0}>
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </div>
      <Card>
        <CardContent>
          {error && <p className="text-sm text-error mb-4">{error}</p>}

          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 w-full"
                placeholder="Search descriptions..."
              />
            </div>
            <Select
              value={accountId}
              onValueChange={(v) => {
                const newId = v === "all" ? "" : v;
                setAccountId(newId);
                setSearchParams((prev) => {
                  if (newId) {
                    prev.set("accountId", newId);
                  } else {
                    prev.delete("accountId");
                  }
                  return prev;
                }, { replace: true });
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v === "all" ? "" : v);
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                handleFilterChange();
              }}
              className="w-full sm:w-[150px]"
              placeholder="Start date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                handleFilterChange();
              }}
              className="w-full sm:w-[150px]"
              placeholder="End date"
            />
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-md bg-muted/50 border border-border">
              <span className="text-sm font-medium">
                {selected.size} selected
              </span>
              <Select
                value={bulkCategory}
                onValueChange={setBulkCategory}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
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
              <Button
                size="sm"
                onClick={handleBulkApply}
                disabled={isBulkApplying}
              >
                {isBulkApplying ? "Applying..." : "Apply"}
              </Button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto"
                onClick={() => {
                  setSelected(new Set());
                  setBulkCategory("__none__");
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}

          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No transactions found. Import a CSV to get started.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={headerChecked}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <SortableTableHead field="date" label="Date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortableTableHead field="description" label="Description" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortableTableHead field="amount" label="Amount" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                    <SortableTableHead field="category" label="Category" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                    <SortableTableHead field="account" label="Account" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(txn.id)}
                          onCheckedChange={() => toggleRow(txn.id)}
                          aria-label={`Select transaction ${txn.description}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(txn.date)}
                      </TableCell>
                      <TableCell>{txn.description}</TableCell>
                      <TableCell
                        className={`text-right whitespace-nowrap ${txn.amount >= 0 ? "text-green-400" : ""}`}
                      >
                        {formatCurrency(txn.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {txn.category ? (
                          <Badge variant="muted">{txn.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {accountMap.get(txn.accountId) ?? txn.accountId}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary-hover"
                          onClick={() => setEditTarget(txn)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    {total} transaction{total !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showImport && (
        <CsvImportDialog
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadTransactions();
          }}
        />
      )}

      {editTarget && (
        <TransactionEditDialog
          transaction={editTarget}
          categories={categories}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            loadTransactions();
          }}
        />
      )}
    </div>
  );
}


function TransactionEditDialog({
  transaction,
  categories,
  onClose,
  onSaved,
}: {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cat, setCat] = useState(transaction.category ?? "");
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data: { category?: string | null; notes?: string | null } = {};
      const newCat = cat || null;
      const oldCat = transaction.category ?? null;
      if (newCat !== oldCat) data.category = newCat;

      const newNotes = notes || null;
      const oldNotes = transaction.notes ?? null;
      if (newNotes !== oldNotes) data.notes = newNotes;

      if (Object.keys(data).length === 0) {
        onClose();
        return;
      }

      await updateTransaction(transaction.id, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">
          <p>{formatDate(transaction.date)} &mdash; {formatCurrency(transaction.amount)}</p>
          <p className="font-medium text-foreground">{transaction.description}</p>
        </div>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <Label>Category</Label>
            <Select
              value={cat || "__none__"}
              onValueChange={(v) => setCat(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
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
          </div>
          <div className="flex flex-col gap-1">
            <Label>Notes</Label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {error && <p className="text-sm text-error text-center">{error}</p>}
          <div className="flex gap-3 justify-end mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
