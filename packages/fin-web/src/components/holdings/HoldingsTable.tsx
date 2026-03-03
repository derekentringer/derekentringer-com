import { useState, useCallback, useMemo } from "react";
import type { Holding, Account, AssetClass } from "@derekentringer/shared/finance";
import { ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import { deleteHolding, fetchQuote } from "../../api/holdings.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { formatCurrencyFull } from "@/lib/chartTheme";
import { Plus, Pencil, Trash2, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface HoldingsTableProps {
  accounts: Account[];
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  onAddHolding: () => void;
  onEditHolding: (holding: Holding) => void;
  holdings: Holding[];
  onRefresh: () => void;
}

type SortField = "name" | "ticker" | "shares" | "costBasis" | "currentPrice" | "marketValue" | "gainLoss" | "assetClass";
type SortDir = "asc" | "desc";

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function HoldingsTable({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onAddHolding,
  onEditHolding,
  holdings,
  onRefresh,
}: HoldingsTableProps) {
  const [fetchingPrice, setFetchingPrice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const sortedHoldings = useMemo(() => {
    if (!sortField) return holdings;
    return [...holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "ticker":
          cmp = (a.ticker ?? "").localeCompare(b.ticker ?? "");
          break;
        case "shares":
          cmp = (a.shares ?? 0) - (b.shares ?? 0);
          break;
        case "costBasis":
          cmp = (a.costBasis ?? 0) - (b.costBasis ?? 0);
          break;
        case "currentPrice":
          cmp = (a.currentPrice ?? 0) - (b.currentPrice ?? 0);
          break;
        case "marketValue":
          cmp = (a.marketValue ?? 0) - (b.marketValue ?? 0);
          break;
        case "gainLoss":
          cmp = (a.gainLoss ?? 0) - (b.gainLoss ?? 0);
          break;
        case "assetClass":
          cmp = (ASSET_CLASS_LABELS[a.assetClass as AssetClass] ?? a.assetClass)
            .localeCompare(ASSET_CLASS_LABELS[b.assetClass as AssetClass] ?? b.assetClass);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [holdings, sortField, sortDir]);

  const handleFetchPrice = useCallback(async (holding: Holding) => {
    if (!holding.ticker) return;
    setFetchingPrice(holding.id);
    try {
      const quote = await fetchQuote(holding.ticker);
      // Update the holding with the new price via the parent's refresh
      const { updateHolding } = await import("../../api/holdings.ts");
      await updateHolding(holding.id, { currentPrice: quote.currentPrice });
      onRefresh();
    } catch {
      // Silently fail — user can retry
    } finally {
      setFetchingPrice(null);
    }
  }, [onRefresh]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await deleteHolding(id);
      onRefresh();
    } catch {
      // Silently fail
    } finally {
      setDeleting(null);
    }
  }, [onRefresh]);

  // Compute totals
  const totalMarketValue = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  const totalCost = holdings.reduce((s, h) => {
    if (h.shares != null && h.costBasis != null) return s + h.shares * h.costBasis;
    return s;
  }, 0);
  const totalGainLoss = totalCost > 0 ? totalMarketValue - totalCost : 0;
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl text-foreground">Holdings</h2>
          <div className="flex items-center gap-2">
            {accounts.length > 1 && (
              <select
                value={selectedAccountId}
                onChange={(e) => onSelectAccount(e.target.value)}
                className="h-9 rounded-lg border border-input bg-input px-3 text-sm text-foreground"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <Button size="sm" onClick={onAddHolding}>
              <Plus className="h-4 w-4 mr-1" />
              Add Holding
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No holdings yet. Click "Add Holding" to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead field="name" label="Name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableTableHead field="ticker" label="Ticker" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableTableHead field="shares" label="Shares" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="costBasis" label="Cost Basis" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="currentPrice" label="Price" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="marketValue" label="Market Value" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="gainLoss" label="Gain/Loss" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="assetClass" label="Class" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHoldings.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell>
                      {h.ticker ? (
                        <Badge variant="muted">{h.ticker}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.shares != null ? h.shares.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.costBasis != null ? formatCurrencyFull(h.costBasis) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {h.currentPrice != null ? formatCurrencyFull(h.currentPrice) : "—"}
                        {h.ticker && (
                          <button
                            onClick={() => handleFetchPrice(h)}
                            disabled={fetchingPrice === h.id}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer"
                            title="Fetch latest price"
                          >
                            <RefreshCw className={`h-3 w-3 ${fetchingPrice === h.id ? "animate-spin" : ""}`} />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {h.marketValue != null ? formatCurrencyFull(h.marketValue) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.gainLoss != null ? (
                        <span className={h.gainLoss >= 0 ? "text-green-400" : "text-red-400"}>
                          {formatCurrencyFull(h.gainLoss)}
                          {h.gainLossPct != null && (
                            <span className="text-xs ml-1">({formatPercent(h.gainLossPct)})</span>
                          )}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {ASSET_CLASS_LABELS[h.assetClass as AssetClass] ?? h.assetClass}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEditHolding(h)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(h.id)}
                          disabled={deleting === h.id}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Summary row */}
                <TableRow className="border-t-2 border-border font-medium">
                  <TableCell colSpan={5} className="text-right text-muted-foreground">
                    Totals
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyFull(totalMarketValue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {totalCost > 0 ? (
                      <span className={totalGainLoss >= 0 ? "text-green-400" : "text-red-400"}>
                        {formatCurrencyFull(totalGainLoss)}
                        <span className="text-xs ml-1">({formatPercent(totalGainLossPct)})</span>
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
