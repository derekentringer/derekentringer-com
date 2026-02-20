import { useState, useEffect, useRef, useCallback } from "react";
import type {
  SavingsAccountSummary,
  SavingsProjectionResponse,
} from "@derekentringer/shared/finance";
import {
  fetchSavingsAccounts,
  fetchSavingsProjection,
} from "@/api/projections.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Check, Clock } from "lucide-react";
import { CHART_COLORS, formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";

type MonthsOption = 12 | 24 | 60 | 120;

const MONTHS_OPTIONS: { value: MonthsOption; label: string }[] = [
  { value: 12, label: "1yr" },
  { value: 24, label: "2yr" },
  { value: 60, label: "5yr" },
  { value: 120, label: "10yr" },
];

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
  const total = payload.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
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

export function SavingsTab() {
  const [accounts, setAccounts] = useState<SavingsAccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [months, setMonths] = useState<MonthsOption>(12);
  const [contribution, setContribution] = useState(0);
  const [apyText, setApyText] = useState("");
  const [apyNumeric, setApyNumeric] = useState(0);
  const [data, setData] = useState<SavingsProjectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load savings accounts on mount
  useEffect(() => {
    setAccountsLoading(true);
    fetchSavingsAccounts()
      .then(({ accounts }) => {
        setAccounts(accounts);
        if (accounts.length > 0) {
          setSelectedAccountId(accounts[0].accountId);
          setContribution(accounts[0].estimatedMonthlyContribution);
          setApyText(accounts[0].apy.toString());
          setApyNumeric(accounts[0].apy);
        }
      })
      .catch(() => {
        setError("Failed to load savings accounts");
      })
      .finally(() => {
        setAccountsLoading(false);
      });
  }, []);

  // When account changes, set contribution/apy from account data
  useEffect(() => {
    if (!selectedAccountId) return;
    const acct = accounts.find((a) => a.accountId === selectedAccountId);
    if (acct) {
      setContribution(acct.estimatedMonthlyContribution);
      setApyText(acct.apy.toString());
      setApyNumeric(acct.apy);
    }
  }, [selectedAccountId, accounts]);

  const loadProjection = useCallback(
    (accountId: string, m: number, contrib: number, apyVal: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);
        fetchSavingsProjection(
          accountId,
          { months: m, contribution: contrib, apy: apyVal },
          controller.signal,
        )
          .then((res) => {
            setData(res);
            setLoading(false);
          })
          .catch((err) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError("Failed to load savings projection");
            setLoading(false);
          });
      }, 300);
    },
    [],
  );

  // Load projection when params change (uses numeric APY to avoid re-fetch on every keystroke)
  useEffect(() => {
    if (!selectedAccountId) return;
    loadProjection(selectedAccountId, months, contribution, apyNumeric);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [selectedAccountId, months, contribution, apyNumeric, loadProjection]);

  const selectedAccount = accounts.find(
    (a) => a.accountId === selectedAccountId,
  );

  const chartData = data?.projection.map((point) => ({
    ...point,
    month: new Date(point.month + "-15").toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
  }));

  if (accountsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-skeleton rounded w-48" />
            <div className="h-[350px] bg-skeleton rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">
            Add a savings or high-yield savings account to see growth
            projections.
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
          </CardContent>
        </Card>
      )}

      {/* Controls row: Account selector + Timeframe */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Select
            value={selectedAccountId ?? ""}
            onValueChange={(v) => setSelectedAccountId(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.accountId} value={a.accountId}>
                  {a.accountName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {MONTHS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={months === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setMonths(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      {selectedAccount && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">Current Balance</p>
              <p className="text-2xl font-bold mt-1 text-violet-500">
                {formatCurrency(selectedAccount.currentBalance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">APY</p>
              <p className="text-2xl font-bold mt-1">
                {selectedAccount.apy.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-foreground">
                Est. Monthly Contribution
              </p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(selectedAccount.estimatedMonthlyContribution)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projection chart */}
      {loading && !data ? (
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-skeleton rounded w-32" />
              <div className="h-[350px] bg-skeleton rounded" />
            </div>
          </CardContent>
        </Card>
      ) : chartData ? (
        <Card>
          <CardHeader>
            <CardTitle>Savings Projection</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
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
                <Legend />
                <Area
                  type="monotone"
                  dataKey="principal"
                  name="Principal"
                  stackId="1"
                  stroke={CHART_COLORS.savingsPrincipal}
                  fill={CHART_COLORS.savingsPrincipal}
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="interest"
                  name="Interest"
                  stackId="1"
                  stroke={CHART_COLORS.savingsInterest}
                  fill={CHART_COLORS.savingsInterest}
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* Controls card */}
      {selectedAccount && (
        <Card>
          <CardHeader>
            <CardTitle>Adjust Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">
                  Monthly Contribution
                </Label>
                <div className="w-28">
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    value={contribution}
                    onChange={(e) =>
                      setContribution(Number(e.target.value) || 0)
                    }
                    className="text-right"
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
              <p className="text-xs text-muted-foreground mt-1">
                3-month average:{" "}
                {formatCurrency(selectedAccount.estimatedMonthlyContribution)}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">APY</Label>
                <div className="flex items-center gap-1 w-28">
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
                    className="text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Milestones card */}
      {data && data.milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.milestones.map((milestone, i) => {
                const reached = milestone.targetDate !== null;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {reached ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
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
                        : "Beyond projection period"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
