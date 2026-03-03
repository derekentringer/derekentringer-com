import { useState, useEffect, useRef, useCallback } from "react";
import type { DebtPayoffResponse, DebtPayoffStrategy, DebtAccountSummary } from "@derekentringer/shared/finance";
import { fetchDebtAccounts, fetchDebtPayoff } from "@/api/projections.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CHART_COLORS, formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { Info, ChevronDown } from "lucide-react";
import { DebtStrategyChart } from "./DebtStrategyChart";
import { DebtAmortizationTable } from "./DebtAmortizationTable";
import { DebtPriorityList } from "./DebtPriorityList";
import { DebtActualVsPlannedChart } from "./DebtActualVsPlannedChart";

const LS_EXTRA_PAYMENT = "debtPayoff.extraPayment";
const LS_SELECTED_ACCOUNTS = "debtPayoff.selectedAccountIds";

const STRATEGY_OPTIONS: { value: DebtPayoffStrategy; label: string }[] = [
  { value: "avalanche", label: "Avalanche" },
  { value: "snowball", label: "Snowball" },
  { value: "custom", label: "Custom" },
];

function formatDebtFreeDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr + "-15").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function DebtPayoffTab() {
  const [extraPayment, setExtraPayment] = useState(() => {
    const saved = localStorage.getItem(LS_EXTRA_PAYMENT);
    if (saved !== null) {
      const val = Number(saved);
      if (Number.isFinite(val) && val >= 0) return val;
    }
    return 0;
  });
  const [extraPaymentInput, setExtraPaymentInput] = useState(() => String(extraPayment));
  const maxMonths = 360;
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<DebtPayoffStrategy>("avalanche");

  // All debt accounts (including mortgages) for the popover
  const [allAccounts, setAllAccounts] = useState<DebtAccountSummary[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const accountsRestoredRef = useRef(false);

  const [data, setData] = useState<DebtPayoffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all accounts on mount (including mortgages) to populate popover
  useEffect(() => {
    fetchDebtAccounts({ includeMortgages: true })
      .then(({ accounts }) => {
        setAllAccounts(accounts);
        // Restore saved selection, falling back to all non-mortgage accounts
        const savedRaw = localStorage.getItem(LS_SELECTED_ACCOUNTS);
        let restored: Set<string> | null = null;
        if (savedRaw) {
          try {
            const ids: string[] = JSON.parse(savedRaw);
            const validIds = ids.filter((id) => accounts.some((a) => a.accountId === id));
            if (validIds.length > 0) restored = new Set(validIds);
          } catch { /* ignore bad data */ }
        }
        setSelectedAccountIds(
          restored ?? new Set(accounts.filter((a) => !a.isMortgage).map((a) => a.accountId)),
        );
        accountsRestoredRef.current = true;
        setAccountsLoaded(true);
      })
      .catch(() => {
        setAccountsLoaded(true);
      });
  }, []);

  // Persist extra payment to localStorage
  useEffect(() => {
    localStorage.setItem(LS_EXTRA_PAYMENT, String(extraPayment));
  }, [extraPayment]);

  // Persist selected account IDs to localStorage (skip the initial restore render)
  const accountsSaveReady = useRef(false);
  useEffect(() => {
    if (!accountsRestoredRef.current) return;
    // Skip the first render after restore to avoid re-saving the just-restored value
    if (!accountsSaveReady.current) {
      accountsSaveReady.current = true;
      return;
    }
    localStorage.setItem(LS_SELECTED_ACCOUNTS, JSON.stringify([...selectedAccountIds]));
  }, [selectedAccountIds]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(
    (extra: number, accountIds: string[], months: number, order: string[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        fetchDebtPayoff(
          {
            extraPayment: extra,
            includeMortgages: true,
            accountIds: accountIds.length > 0 ? accountIds : undefined,
            customOrder: order.length > 0 ? order : undefined,
            maxMonths: months,
          },
          controller.signal,
        )
          .then((result) => {
            setData(result);
            // Initialize custom order if not set
            if (order.length === 0 && result.debtAccounts.length > 0) {
              setCustomOrder(result.debtAccounts.map((d) => d.accountId));
            }
            setLoading(false);
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError("Failed to load debt payoff data");
            setLoading(false);
          });
      }, 300);
    },
    [],
  );

  const selectedIdsArray = [...selectedAccountIds];

  useEffect(() => {
    if (!accountsLoaded) return;
    loadData(extraPayment, selectedIdsArray, maxMonths, customOrder);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [extraPayment, accountsLoaded, maxMonths, customOrder, loadData, ...selectedIdsArray]);

  function toggleAccount(accountId: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
    setCustomOrder([]);
  }

  const mortgageAccounts = allAccounts.filter((a) => a.isMortgage);
  const hasMortgages = mortgageAccounts.length > 0;
  const allMortgagesSelected = hasMortgages && mortgageAccounts.every((a) => selectedAccountIds.has(a.accountId));
  const someMortgagesSelected = hasMortgages && mortgageAccounts.some((a) => selectedAccountIds.has(a.accountId));

  function toggleMortgages() {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (allMortgagesSelected) {
        for (const a of mortgageAccounts) next.delete(a.accountId);
      } else {
        for (const a of mortgageAccounts) next.add(a.accountId);
      }
      return next;
    });
    setCustomOrder([]);
  }

  const selectedCount = selectedAccountIds.size;

  const selectedResult =
    data && selectedStrategy === "avalanche"
      ? data.avalanche
      : data && selectedStrategy === "snowball"
        ? data.snowball
        : data?.custom ?? data?.avalanche ?? null;

  // Compute interest saved (minimum-only vs with extra payment)
  const minOnlyInterest = data
    ? Math.max(data.avalanche.totalInterestPaid, data.snowball.totalInterestPaid)
    : 0;
  const bestInterest = data
    ? Math.min(data.avalanche.totalInterestPaid, data.snowball.totalInterestPaid)
    : 0;
  const interestSaved = minOnlyInterest > 0 ? minOnlyInterest - bestInterest : 0;
  const bestStrategy = data
    ? data.avalanche.totalInterestPaid <= data.snowball.totalInterestPaid ? "Avalanche" : "Snowball"
    : "Avalanche";

  const totalDebt = data
    ? data.debtAccounts.reduce((s, d) => s + d.currentBalance, 0)
    : 0;

  const totalMinPayment = data
    ? data.debtAccounts.reduce((s, d) => s + d.minimumPayment, 0)
    : 0;

  // Empty state
  if (!loading && data && data.debtAccounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">
            No debt accounts found. Add a Credit or Loan account to get started.
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
                onClick={() => loadData(extraPayment, selectedIdsArray, maxMonths, customOrder)}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-3 bg-skeleton rounded w-20" />
                  <div className="h-7 bg-skeleton rounded w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-foreground">Total Debt</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-52">
                    The combined current balance across all selected debt accounts.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold mt-1 text-destructive">
                {formatCurrency(totalDebt)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.debtAccounts.length} account{data.debtAccounts.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-foreground">Debt-Free Date</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-52">
                    The projected date all selected debts are paid off using the avalanche strategy (highest interest rate first).
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold mt-1 text-success">
                {formatDebtFreeDate(data.avalanche.debtFreeDate)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Avalanche strategy</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-foreground">Interest Saved</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-52">
                    The difference in total interest paid between avalanche and snowball strategies. {bestStrategy} saves more by paying less interest overall.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: CHART_COLORS.debtAvalanche }}>
                {formatCurrency(interestSaved)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{bestStrategy} saves more</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-foreground">Monthly Payment</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-52">
                    Your total monthly payment: the sum of all minimum payments plus any extra payment you've set above.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: CHART_COLORS.balance }}>
                {formatCurrency(totalMinPayment + extraPayment)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(totalMinPayment)} min + {formatCurrency(extraPayment)} extra
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-payment" className="text-xs">Extra Monthly Payment</Label>
              <Input
                id="extra-payment"
                type="number"
                min={0}
                max={50000}
                step={50}
                value={extraPaymentInput}
                onChange={(e) => {
                  setExtraPaymentInput(e.target.value);
                  const num = Number(e.target.value);
                  if (e.target.value === "" || !Number.isFinite(num)) {
                    setExtraPayment(0);
                  } else {
                    setExtraPayment(Math.max(0, Math.min(50000, num)));
                  }
                }}
                onBlur={() => {
                  setExtraPaymentInput(String(extraPayment));
                }}
                className="w-32"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Extra Payment</Label>
              <input
                type="range"
                min={0}
                max={2000}
                step={25}
                value={Math.min(extraPayment, 2000)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setExtraPayment(val);
                  setExtraPaymentInput(String(val));
                }}
                className="w-40"
                style={{ "--range-pct": `${(Math.min(extraPayment, 2000) / 2000) * 100}%` } as React.CSSProperties}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Accounts</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    {selectedCount} of {allAccounts.length} selected
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3">
                  <div className="flex flex-col gap-2">
                    {allAccounts.map((acct) => (
                      <label
                        key={acct.accountId}
                        className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-1 py-1 -mx-1"
                      >
                        <Checkbox
                          checked={selectedAccountIds.has(acct.accountId)}
                          onCheckedChange={() => toggleAccount(acct.accountId)}
                        />
                        <span className="text-sm flex-1 truncate">{acct.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {acct.interestRate}%
                        </span>
                      </label>
                    ))}
                    {hasMortgages && (
                      <>
                        <div className="border-t border-border my-1" />
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-1 py-1 -mx-1">
                          <Checkbox
                            checked={allMortgagesSelected ? true : someMortgagesSelected ? "indeterminate" : false}
                            onCheckedChange={toggleMortgages}
                          />
                          <span className="text-sm text-muted-foreground">Include Mortgages</span>
                        </label>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Strategy comparison charts */}
      {loading && !data ? (
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-skeleton rounded w-32" />
              <div className="h-[300px] bg-skeleton rounded" />
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-medium text-foreground">Avalanche</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      Pay minimums on all debts, then put extra toward the highest interest rate first. Saves the most money over time.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col items-end text-xs text-muted-foreground">
                  <span>Interest Paid: <span className="text-foreground">{formatCurrency(data.avalanche.totalInterestPaid)}</span></span>
                  <span>Debt-free: {formatDebtFreeDate(data.avalanche.debtFreeDate)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn("transition-opacity", loading && "opacity-40")}>
                <DebtStrategyChart
                  result={data.avalanche}
                  debtAccounts={data.debtAccounts}
                  extraPayment={extraPayment}
                  label="Avalanche"
                  color={CHART_COLORS.debtAvalanche}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-medium text-foreground">Snowball</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      Pay minimums on all debts, then put extra toward the smallest balance first. Eliminates individual debts faster for quick wins.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col items-end text-xs text-muted-foreground">
                  <span>Interest Paid: <span className="text-foreground">{formatCurrency(data.snowball.totalInterestPaid)}</span></span>
                  <span>Debt-free: {formatDebtFreeDate(data.snowball.debtFreeDate)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn("transition-opacity", loading && "opacity-40")}>
                <DebtStrategyChart
                  result={data.snowball}
                  debtAccounts={data.debtAccounts}
                  extraPayment={extraPayment}
                  label="Snowball"
                  color={CHART_COLORS.debtSnowball}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Strategy detail section */}
      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-foreground">Amortization Schedule</h2>
              <div className="flex items-center rounded-md border border-border overflow-hidden">
                {STRATEGY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedStrategy(opt.value)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
                      opt.value === selectedStrategy
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
            {selectedStrategy === "custom" && (
              <div className="mb-4">
                <DebtPriorityList
                  accounts={data.debtAccounts}
                  order={customOrder}
                  onOrderChange={setCustomOrder}
                />
              </div>
            )}
            {selectedResult && (
              <DebtAmortizationTable result={selectedResult} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Actual vs planned */}
      {data && data.actualVsPlanned.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-medium text-foreground">Actual vs Planned</h2>
          {data.actualVsPlanned.map((avp) => {
            const acct = data.debtAccounts.find((d) => d.accountId === avp.accountId);
            return (
              <DebtActualVsPlannedChart
                key={avp.accountId}
                data={avp}
                extraPayment={extraPayment}
                minimumPayment={acct?.minimumPayment ?? 0}
                interestRate={acct?.interestRate ?? 0}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
