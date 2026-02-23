import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import type {
  Account,
  Balance,
  LoanProfileData,
  InvestmentProfileData,
  CreditProfileData,
  MortgageRatesResponse,
} from "@derekentringer/shared/finance";
import { ACCOUNT_TYPE_GROUPS } from "@derekentringer/shared/finance";
import { fetchAccounts } from "../api/accounts.ts";
import { fetchBalances } from "../api/balances.ts";
import { fetchTransactions } from "../api/transactions.ts";
import { fetchMortgageRates } from "../api/dashboard.ts";
import { AccountBalanceCard } from "../components/dashboard/AccountBalanceCard.tsx";
import { RecentTransactionsCard } from "../components/dashboard/RecentTransactionsCard.tsx";
import { PdfImportDialog } from "../components/PdfImportDialog.tsx";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyFull } from "@/lib/chartTheme";
import { FileUp } from "lucide-react";

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

// --- Tier helpers ---

function TierOneMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium text-foreground">{value}</p>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// --- Progress bars ---

function CreditUtilizationBar({ balance, creditLimit }: { balance: number; creditLimit: number }) {
  if (creditLimit <= 0) return null;
  const utilization = Math.min(Math.abs(balance) / creditLimit, 1);
  const pct = utilization * 100;
  const color = pct < 30 ? "bg-success" : pct < 70 ? "bg-yellow-500" : "bg-destructive";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Credit Utilization</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-input">
        <div className={cn("h-2 rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LoanPayoffBar({ currentBalance, originalBalance }: { currentBalance: number; originalBalance: number }) {
  if (originalBalance <= 0) return null;
  const paid = Math.max(0, originalBalance - Math.abs(currentBalance));
  const pct = Math.min((paid / originalBalance) * 100, 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Payoff Progress</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-input">
        <div className="h-2 rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- Tiered profile summaries ---

function LoanProfileTiered({ profile, account, className, marketRates }: { profile: LoanProfileData; account: Account; className?: string; marketRates?: MortgageRatesResponse | null }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <h3 className="text-sm font-medium text-foreground">Latest Statement Profile</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        {/* Tier 1: Key metrics */}
        <div className="grid grid-cols-2 gap-4">
          {profile.interestRate != null && (
            <div>
              <TierOneMetric label="Interest Rate" value={formatPercent(profile.interestRate)} />
              {marketRates && (marketRates.rate30yr != null || marketRates.rate15yr != null) && (
                <div className="flex gap-1.5 mt-1">
                  {marketRates.rate30yr != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-input text-muted-foreground">
                      30yr: {marketRates.rate30yr.toFixed(2)}%
                    </span>
                  )}
                  {marketRates.rate15yr != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-input text-muted-foreground">
                      15yr: {marketRates.rate15yr.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {profile.monthlyPayment != null && <TierOneMetric label="Monthly Payment" value={formatCurrencyFull(profile.monthlyPayment)} />}
          {profile.remainingTermMonths != null && <TierOneMetric label="Remaining Term" value={`${profile.remainingTermMonths} mo`} />}
        </div>

        {/* Progress bar */}
        {account.originalBalance != null && (
          <LoanPayoffBar currentBalance={account.currentBalance} originalBalance={account.originalBalance} />
        )}

        {/* Tier 2: Supporting detail */}
        <div className="flex flex-col gap-1.5">
          <ProfileField label="Principal Paid" value={profile.principalPaid != null ? formatCurrencyFull(profile.principalPaid) : undefined} />
          <ProfileField label="Interest Paid" value={profile.interestPaid != null ? formatCurrencyFull(profile.interestPaid) : undefined} />
          <ProfileField label="Escrow" value={profile.escrowAmount != null ? formatCurrencyFull(profile.escrowAmount) : undefined} />
        </div>

        {/* Tier 3: Period dates */}
        {profile.periodStart && profile.periodEnd && (
          <p className="text-xs text-muted-foreground">{profile.periodStart} — {profile.periodEnd}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InvestmentProfileTiered({ profile, className }: { profile: InvestmentProfileData; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <h3 className="text-sm font-medium text-foreground">Latest Statement Profile</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        {/* Tier 1 */}
        <div className="grid grid-cols-2 gap-4">
          {profile.rateOfReturn != null && <TierOneMetric label="Rate of Return" value={formatPercent(profile.rateOfReturn)} />}
          {profile.totalGainLoss != null && <TierOneMetric label="Total Gain/Loss" value={formatCurrencyFull(profile.totalGainLoss)} />}
          {profile.ytdReturn != null && <TierOneMetric label="YTD Return" value={formatPercent(profile.ytdReturn)} />}
        </div>

        {/* Tier 2 */}
        <div className="flex flex-col gap-1.5">
          <ProfileField label="Contributions" value={profile.contributions != null ? formatCurrencyFull(profile.contributions) : undefined} />
          <ProfileField label="Employer Match" value={profile.employerMatch != null ? formatCurrencyFull(profile.employerMatch) : undefined} />
          <ProfileField label="Vesting" value={profile.vestingPct != null ? formatPercent(profile.vestingPct) : undefined} />
          <ProfileField label="Fees" value={profile.fees != null ? formatCurrencyFull(profile.fees) : undefined} />
          <ProfileField label="Dividends" value={profile.dividends != null ? formatCurrencyFull(profile.dividends) : undefined} />
        </div>

        {/* Tier 3 */}
        {profile.periodStart && profile.periodEnd && (
          <p className="text-xs text-muted-foreground">{profile.periodStart} — {profile.periodEnd}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CreditProfileTiered({ profile, account, className }: { profile: CreditProfileData; account: Account; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <h3 className="text-sm font-medium text-foreground">Latest Statement Profile</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        {/* Tier 1 */}
        <div className="grid grid-cols-2 gap-4">
          {profile.apr != null && <TierOneMetric label="APR" value={formatPercent(profile.apr)} />}
          {profile.creditLimit != null && <TierOneMetric label="Credit Limit" value={formatCurrencyFull(profile.creditLimit)} />}
          {profile.availableCredit != null && <TierOneMetric label="Available Credit" value={formatCurrencyFull(profile.availableCredit)} />}
        </div>

        {/* Credit utilization bar */}
        {profile.creditLimit != null && (
          <CreditUtilizationBar balance={account.currentBalance} creditLimit={profile.creditLimit} />
        )}

        {/* Tier 2 */}
        <div className="flex flex-col gap-1.5">
          <ProfileField label="Minimum Payment" value={profile.minimumPayment != null ? formatCurrencyFull(profile.minimumPayment) : undefined} />
          <ProfileField label="Interest Charged" value={profile.interestCharged != null ? formatCurrencyFull(profile.interestCharged) : undefined} />
          <ProfileField label="Fees Charged" value={profile.feesCharged != null ? formatCurrencyFull(profile.feesCharged) : undefined} />
          <ProfileField label="Rewards Earned" value={profile.rewardsEarned != null ? formatCurrencyFull(profile.rewardsEarned) : undefined} />
        </div>

        {/* Tier 3 */}
        {profile.periodStart && profile.periodEnd && (
          <p className="text-xs text-muted-foreground">{profile.periodStart} — {profile.periodEnd}</p>
        )}
      </CardContent>
    </Card>
  );
}

// --- KPI computation ---

interface KpiTrend {
  direction: "up" | "down" | "neutral";
  value: string;
  label?: string;
  invertColor?: boolean;
}

interface KpiSparkline {
  data: number[];
  change: number;
  label: string;
  color: string;
  invertColor?: boolean;
}

interface KpiData {
  title: string;
  value: string;
  tooltip?: string;
  trend?: KpiTrend;
  sparkline?: KpiSparkline;
}

function computeBalanceTrend(items: AccountWithProfile[]): KpiTrend | undefined {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let currentTotal = 0;
  let previousTotal = 0;
  let hasHistory = false;

  for (const item of items) {
    currentTotal += item.account.currentBalance;

    if (item.allBalances.length < 2) {
      previousTotal += item.account.currentBalance;
      continue;
    }

    // Find balance closest to 30 days ago
    let closest = item.allBalances[0];
    let closestDiff = Infinity;
    for (const bal of item.allBalances) {
      const balDate = new Date(bal.date);
      const diff = Math.abs(balDate.getTime() - thirtyDaysAgo.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = bal;
      }
    }
    previousTotal += closest.balance;
    hasHistory = true;
  }

  if (!hasHistory || previousTotal === 0) return undefined;

  const pct = ((currentTotal - previousTotal) / Math.abs(previousTotal)) * 100;
  if (Math.abs(pct) < 0.05) return { direction: "neutral", value: "0.0%", label: "30d" };
  return {
    direction: pct >= 0 ? "up" : "down",
    value: `${Math.abs(pct).toFixed(1)}%`,
    label: "30d",
  };
}

interface MtdData {
  mtdDebits: number;
  mtdCredits: number;
  prevMtdDebits: number;
  prevMtdCredits: number;
  /** Current-month transactions sorted by date, for building daily sparklines */
  currentMonthTxns: { date: string; amount: number }[];
}

const COLOR_GREEN = "hsl(142.1 76.2% 36.3%)";
const COLOR_RED = "hsl(0 84.2% 60.2%)";

/** Build cumulative daily totals from transactions, returning one data point per day */
function buildDailySparkline(
  txns: { date: string; amount: number }[],
  filter: "debits" | "credits" | "net",
): number[] {
  if (txns.length === 0) return [];
  // Group by date
  const byDate = new Map<string, number>();
  for (const txn of txns) {
    const day = txn.date.slice(0, 10);
    const prev = byDate.get(day) ?? 0;
    if (filter === "debits") {
      if (txn.amount < 0) byDate.set(day, prev + Math.abs(txn.amount));
      else if (!byDate.has(day)) byDate.set(day, 0);
    } else if (filter === "credits") {
      if (txn.amount > 0) byDate.set(day, prev + txn.amount);
      else if (!byDate.has(day)) byDate.set(day, 0);
    } else {
      byDate.set(day, prev + txn.amount);
    }
  }
  const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // Build cumulative
  const cumulative: number[] = [];
  let sum = 0;
  for (const [, v] of sorted) {
    sum += v;
    cumulative.push(sum);
  }
  return cumulative;
}

/**
 * Aggregate a per-balance metric across accounts with carry-forward.
 * On dates where an account has no entry, its last known value is carried forward
 * so every data point reflects all accounts — not just those with entries on that date.
 */
function buildAggregatedSparkline(
  items: AccountWithProfile[],
  getValue: (bal: Balance, account: Account) => number,
  recentCount = 12,
): number[] {
  const accounts: Map<string, number>[] = [];
  const allDates = new Set<string>();
  for (const item of items) {
    const dateMap = new Map<string, number>();
    for (const bal of item.allBalances) {
      const day = bal.date.slice(0, 10);
      allDates.add(day);
      dateMap.set(day, (dateMap.get(day) ?? 0) + getValue(bal, item.account));
    }
    if (dateMap.size > 0) accounts.push(dateMap);
  }
  if (allDates.size === 0 || accounts.length === 0) return [];

  const sortedDates = [...allDates].sort();
  const window = sortedDates.slice(-recentCount);

  // Initialize carry-forward: null means "not seen yet"
  const lastKnown: (number | null)[] = accounts.map(() => null);
  for (const date of sortedDates) {
    if (date >= window[0]) break;
    for (let i = 0; i < accounts.length; i++) {
      const val = accounts[i].get(date);
      if (val !== undefined) lastKnown[i] = val;
    }
  }

  return window.map((date) => {
    let sum = 0;
    for (let i = 0; i < accounts.length; i++) {
      const val = accounts[i].get(date);
      if (val !== undefined) lastKnown[i] = val;
      if (lastKnown[i] !== null) sum += lastKnown[i] as number;
    }
    return sum;
  });
}

function computeKpis(slug: string, items: AccountWithProfile[], mtd?: MtdData): KpiData[] {
  const kpis: KpiData[] = [];
  const totalBalance = items.reduce((s, i) => s + i.account.currentBalance, 0);

  // Build balance sparkline from recent balance history (last 12 entries for shape)
  let balanceSparkline: KpiSparkline | undefined;
  {
    const data = buildAggregatedSparkline(items, (bal) => bal.balance);
    if (data.length >= 2) {
      const first = data[0];
      const last = data[data.length - 1];
      const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
      balanceSparkline = {
        data,
        change,
        label: "30d",
        color: change >= 0 ? COLOR_GREEN : COLOR_RED,
      };
    }
  }

  // For debt accounts, declining balance is positive — invert sparkline colors
  const debtBalanceSparkline: KpiSparkline | undefined = balanceSparkline
    ? { ...balanceSparkline, color: balanceSparkline.change <= 0 ? COLOR_GREEN : COLOR_RED, invertColor: true }
    : undefined;

  const balanceTrend = computeBalanceTrend(items);
  // Tooltip text depends on account type — slug-specific sections may clear & re-push with their own tooltip
  const balanceTooltipMap: Record<string, string> = {
    checking: "Combined balance across all checking accounts",
    savings: "Combined balance across all savings accounts",
    loans: "Combined outstanding balance across all loans",
  };
  kpis.push({ title: "Total Balance", value: formatCurrency(totalBalance), tooltip: balanceTooltipMap[slug], trend: balanceTrend, sparkline: slug === "loans" ? debtBalanceSparkline : balanceSparkline });

  if (slug === "savings") {
    const apys = items
      .map((i) => i.latestBalance?.savingsProfile?.apy ?? i.account.interestRate)
      .filter((v): v is number => v != null);
    if (apys.length === 1) {
      kpis.push({ title: "Current APY", value: formatPercent(apys[0]), tooltip: "Annual percentage yield earned on deposits" });
    } else if (apys.length > 1) {
      const avg = apys.reduce((s, v) => s + v, 0) / apys.length;
      kpis.push({ title: "Avg APY", value: formatPercent(avg), tooltip: "Average APY across savings accounts" });
    }

    const interestEarned = items
      .map((i) => i.latestBalance?.savingsProfile?.interestEarned)
      .filter((v): v is number => v != null);
    if (interestEarned.length > 0) {
      kpis.push({ title: "Interest Earned", value: formatCurrency(interestEarned.reduce((s, v) => s + v, 0)), tooltip: "Interest earned in the latest statement period" });
    }

    const interestYtd = items
      .map((i) => i.latestBalance?.savingsProfile?.interestEarnedYtd)
      .filter((v): v is number => v != null);
    if (interestYtd.length > 0) {
      kpis.push({ title: "Interest YTD", value: formatCurrency(interestYtd.reduce((s, v) => s + v, 0)), tooltip: "Total interest earned year-to-date" });
    }
  }

  if (slug === "credit") {
    // Remove the default Total Balance that was pushed above — we'll re-add it in the right order
    kpis.length = 0;

    const creditLimits = items
      .map((i) => i.latestBalance?.creditProfile?.creditLimit)
      .filter((v): v is number => v != null);
    kpis.push({ title: "Total Credit Limit", value: formatCurrency(creditLimits.length > 0 ? creditLimits.reduce((s, v) => s + v, 0) : 0), tooltip: "Combined credit limit across all cards" });

    kpis.push({ title: "Total Balance", value: formatCurrency(totalBalance), tooltip: "Combined outstanding balance across all cards", trend: balanceTrend, sparkline: debtBalanceSparkline });

    const limits = items
      .map((i) => i.latestBalance?.creditProfile?.creditLimit)
      .filter((v): v is number => v != null);
    const totalLimit = limits.length > 0 ? limits.reduce((s, v) => s + v, 0) : 0;
    const utilization = totalLimit > 0 ? (Math.abs(totalBalance) / totalLimit) * 100 : 0;

    // Build utilization sparkline from historical balances + credit limits
    let utilizationSparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, { balance: number; limit: number }>();
      for (const item of items) {
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          const limit = bal.creditProfile?.creditLimit ?? 0;
          const existing = byDate.get(day) ?? { balance: 0, limit: 0 };
          byDate.set(day, {
            balance: existing.balance + Math.abs(bal.balance),
            limit: existing.limit + limit,
          });
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent
        .filter(([, v]) => v.limit > 0)
        .map(([, v]) => (v.balance / v.limit) * 100);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        utilizationSparkline = {
          data: points,
          change,
          label: "trend",
          color: last <= first ? COLOR_GREEN : COLOR_RED,
          invertColor: true,
        };
      }
    }

    kpis.push({ title: "Total Credit Utilization", value: `${utilization.toFixed(1)}%`, tooltip: "Percentage of total credit limit currently in use", sparkline: utilizationSparkline });

    const minPayments = items
      .map((i) => i.latestBalance?.creditProfile?.minimumPayment)
      .filter((v): v is number => v != null);
    const totalMinPayment = minPayments.length > 0 ? minPayments.reduce((s, v) => s + v, 0) : 0;

    // Build minimum payment sparkline from historical balances
    let minPaymentSparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, number>();
      for (const item of items) {
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          const payment = bal.creditProfile?.minimumPayment ?? 0;
          byDate.set(day, (byDate.get(day) ?? 0) + payment);
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent.map(([, v]) => v);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        minPaymentSparkline = {
          data: points,
          change,
          label: "trend",
          color: last <= first ? COLOR_GREEN : COLOR_RED,
          invertColor: true,
        };
      }
    }

    kpis.push({ title: "Total Minimum Payment", value: formatCurrency(totalMinPayment), tooltip: "Combined minimum payments due across all cards", sparkline: minPaymentSparkline });
  }

  if (slug === "loans") {
    const payments = items
      .map((i) => i.latestBalance?.loanProfile?.monthlyPayment)
      .filter((v): v is number => v != null);
    if (payments.length > 0) {
      kpis.push({ title: "Total Monthly Payment", value: formatCurrency(payments.reduce((s, v) => s + v, 0)), tooltip: "Combined monthly payments across all loans" });
    }

    // Total Interest Paid with sparkline
    const interestPaid = items
      .map((i) => i.latestBalance?.loanProfile?.interestPaid)
      .filter((v): v is number => v != null);
    const totalInterestPaid = interestPaid.length > 0 ? interestPaid.reduce((s, v) => s + v, 0) : 0;

    let interestPaidSparkline: KpiSparkline | undefined;
    {
      const data = buildAggregatedSparkline(items, (bal) => bal.loanProfile?.interestPaid ?? 0);
      if (data.length >= 2) {
        const first = data[0];
        const last = data[data.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        interestPaidSparkline = {
          data,
          change,
          label: "trend",
          color: last <= first ? COLOR_GREEN : COLOR_RED,
          invertColor: true,
        };
      }
    }

    kpis.push({ title: "Interest Paid (Period)", value: formatCurrency(totalInterestPaid), tooltip: "Total interest paid in the latest statement period", sparkline: interestPaidSparkline });

    // Overall Payoff Progress with sparkline
    const totalOriginal = items.reduce((s, i) => s + (i.account.originalBalance ?? 0), 0);
    const totalCurrent = Math.abs(totalBalance);
    const payoffPct = totalOriginal > 0 ? ((totalOriginal - totalCurrent) / totalOriginal) * 100 : 0;

    let payoffSparkline: KpiSparkline | undefined;
    {
      const validItems = items.filter((i) => (i.account.originalBalance ?? 0) > 0);
      if (validItems.length > 0) {
        const data = buildAggregatedSparkline(
          validItems,
          (bal, account) => {
            const orig = account.originalBalance ?? 0;
            return orig > 0 ? ((orig - Math.abs(bal.balance)) / orig) * 100 : 0;
          },
        );
        // Average across accounts
        const averaged = validItems.length > 1 ? data.map((v) => v / validItems.length) : data;
        if (averaged.length >= 2) {
          const first = averaged[0];
          const last = averaged[averaged.length - 1];
          const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
          payoffSparkline = {
            data: averaged,
            change,
            label: "trend",
            color: last >= first ? COLOR_GREEN : COLOR_RED,
          };
        }
      }
    }

    kpis.push({ title: "Overall Payoff Progress", value: `${payoffPct.toFixed(1)}%`, tooltip: "Percentage of original loan balances paid off", sparkline: payoffSparkline });
  }

  if (slug === "investments") {
    // Clear default Total Balance — we'll re-add it in the right order
    kpis.length = 0;

    // 1. YTD Return with sparkline (use most recent non-null ytdReturn per account)
    const ytdReturns = items
      .map((i) => {
        for (const bal of i.allBalances) {
          if (bal.investmentProfile?.ytdReturn != null) return bal.investmentProfile.ytdReturn;
        }
        return null;
      })
      .filter((v): v is number => v != null);
    const avgYtd = ytdReturns.length > 0 ? ytdReturns.reduce((s, v) => s + v, 0) / ytdReturns.length : 0;

    let ytdSparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, { total: number; count: number }>();
      for (const item of items) {
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          const ytd = bal.investmentProfile?.ytdReturn;
          if (ytd == null) continue;
          const existing = byDate.get(day) ?? { total: 0, count: 0 };
          byDate.set(day, { total: existing.total + ytd, count: existing.count + 1 });
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent.map(([, v]) => v.total / v.count);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        ytdSparkline = {
          data: points,
          change,
          label: "trend",
          color: last >= first ? COLOR_GREEN : COLOR_RED,
        };
      }
    }

    kpis.push({ title: "YTD Return", value: formatPercent(avgYtd), tooltip: "Average year-to-date return across investment accounts", sparkline: ytdSparkline });

    // 2. Total Contributions with sparkline (use most recent non-null per account)
    const contributions = items
      .map((i) => {
        for (const bal of i.allBalances) {
          if (bal.investmentProfile?.contributions != null) return bal.investmentProfile.contributions;
        }
        return null;
      })
      .filter((v): v is number => v != null);
    const totalContributions = contributions.reduce((s, v) => s + v, 0);

    let contribSparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, number>();
      for (const item of items) {
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          const contrib = bal.investmentProfile?.contributions ?? 0;
          byDate.set(day, (byDate.get(day) ?? 0) + contrib);
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent.map(([, v]) => v);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        contribSparkline = {
          data: points,
          change,
          label: "trend",
          color: change >= 0 ? COLOR_GREEN : COLOR_RED,
        };
      }
    }

    kpis.push({ title: "Total Contributions", value: formatCurrency(totalContributions), tooltip: "Combined contributions in the latest statement period", sparkline: contribSparkline });

    // 3. Total Balance (re-add with trend + sparkline)
    kpis.push({ title: "Total Balance", value: formatCurrency(totalBalance), tooltip: "Combined market value across all investment accounts", trend: balanceTrend, sparkline: balanceSparkline });

    // 4. Total Dividends with sparkline (use most recent non-null per account)
    const dividends = items
      .map((i) => {
        for (const bal of i.allBalances) {
          if (bal.investmentProfile?.dividends != null) return bal.investmentProfile.dividends;
        }
        return null;
      })
      .filter((v): v is number => v != null);
    const totalDividends = dividends.reduce((s, v) => s + v, 0);

    let dividendSparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, number>();
      for (const item of items) {
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          const div = bal.investmentProfile?.dividends ?? 0;
          byDate.set(day, (byDate.get(day) ?? 0) + div);
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent.map(([, v]) => v);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        dividendSparkline = {
          data: points,
          change,
          label: "trend",
          color: change >= 0 ? COLOR_GREEN : COLOR_RED,
        };
      }
    }

    kpis.push({ title: "Total Dividends", value: formatCurrency(totalDividends), tooltip: "Combined dividends in the latest statement period", sparkline: dividendSparkline });
  }

  if (slug === "real-estate") {
    // Clear default Total Balance — we'll re-add it in the right order
    kpis.length = 0;

    const totalEstimatedValue = items.reduce((s, i) => s + (i.account.estimatedValue ?? 0), 0);
    const totalCurrentBalance = Math.abs(totalBalance);
    const totalEquity = totalEstimatedValue - totalCurrentBalance;

    kpis.push({ title: "Total Estimated Value", value: formatCurrency(totalEstimatedValue), tooltip: "Combined estimated market value of all properties" });

    // Total Equity with sparkline
    let equitySparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, number>();
      for (const item of items) {
        const ev = item.account.estimatedValue ?? 0;
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          byDate.set(day, (byDate.get(day) ?? 0) + (ev - Math.abs(bal.balance)));
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent.map(([, v]) => v);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        equitySparkline = {
          data: points,
          change,
          label: "trend",
          color: change >= 0 ? COLOR_GREEN : COLOR_RED,
        };
      }
    }
    kpis.push({ title: "Total Equity", value: formatCurrency(totalEquity), tooltip: "Estimated value minus outstanding mortgage balances", sparkline: equitySparkline });

    // Loan-to-Value Ratio with sparkline
    const ltv = totalEstimatedValue > 0 ? (totalCurrentBalance / totalEstimatedValue) * 100 : 0;
    let ltvSparkline: KpiSparkline | undefined;
    {
      const byDate = new Map<string, { balance: number; value: number }>();
      for (const item of items) {
        const ev = item.account.estimatedValue ?? 0;
        if (ev <= 0) continue;
        for (const bal of item.allBalances) {
          const day = bal.date.slice(0, 10);
          const existing = byDate.get(day) ?? { balance: 0, value: 0 };
          byDate.set(day, {
            balance: existing.balance + Math.abs(bal.balance),
            value: existing.value + ev,
          });
        }
      }
      const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const recent = sorted.slice(-12);
      const points = recent
        .filter(([, v]) => v.value > 0)
        .map(([, v]) => (v.balance / v.value) * 100);
      if (points.length >= 2) {
        const first = points[0];
        const last = points[points.length - 1];
        const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        ltvSparkline = {
          data: points,
          change,
          label: "trend",
          color: last <= first ? COLOR_GREEN : COLOR_RED,
          invertColor: true,
        };
      }
    }
    kpis.push({ title: "Loan-to-Value Ratio", value: `${ltv.toFixed(1)}%`, tooltip: "Outstanding balance as a percentage of property value. Below 80% is good — no PMI required. Lower is better.", sparkline: ltvSparkline });

    kpis.push({ title: "Total Balance", value: formatCurrency(totalBalance), tooltip: "Combined outstanding mortgage balances", trend: balanceTrend, sparkline: debtBalanceSparkline });
  }

  if (slug === "checking") {
    const rates = items
      .map((i) => i.account.interestRate)
      .filter((v): v is number => v != null);
    if (rates.length > 0) {
      kpis.push({ title: "Avg Rate", value: formatPercent(rates.reduce((s, v) => s + v, 0) / rates.length), tooltip: "Average interest rate across checking accounts" });
    }
  }

  if (slug === "checking" && mtd) {
    // Build daily sparkline data from current-month transactions
    const debitSpark = buildDailySparkline(mtd.currentMonthTxns, "debits");
    const creditSpark = buildDailySparkline(mtd.currentMonthTxns, "credits");
    const netSpark = buildDailySparkline(mtd.currentMonthTxns, "net");

    // Total Debits MTD
    const debitChange = mtd.prevMtdDebits > 0
      ? ((mtd.mtdDebits - mtd.prevMtdDebits) / mtd.prevMtdDebits) * 100
      : 0;
    const debitSparkline: KpiSparkline | undefined = debitSpark.length >= 2
      ? { data: debitSpark, change: debitChange, label: "MTD", color: debitChange <= 0 ? COLOR_GREEN : COLOR_RED, invertColor: true }
      : undefined;
    kpis.push({ title: "Total Debits", value: formatCurrency(mtd.mtdDebits), tooltip: "Total outgoing transactions this month", sparkline: debitSparkline });

    // Total Credits MTD
    const creditChange = mtd.prevMtdCredits > 0
      ? ((mtd.mtdCredits - mtd.prevMtdCredits) / mtd.prevMtdCredits) * 100
      : 0;
    const creditSparkline: KpiSparkline | undefined = creditSpark.length >= 2
      ? { data: creditSpark, change: creditChange, label: "MTD", color: creditChange >= 0 ? COLOR_GREEN : COLOR_RED }
      : undefined;
    kpis.push({ title: "Total Credits", value: formatCurrency(mtd.mtdCredits), tooltip: "Total incoming transactions this month", sparkline: creditSparkline });

    // Net Cash Flow MTD
    const netCashFlow = mtd.mtdCredits - mtd.mtdDebits;
    const prevNetCashFlow = mtd.prevMtdCredits - mtd.prevMtdDebits;
    const netChange = prevNetCashFlow !== 0
      ? ((netCashFlow - prevNetCashFlow) / Math.abs(prevNetCashFlow)) * 100
      : 0;
    const netSparkline: KpiSparkline | undefined = netSpark.length >= 2
      ? { data: netSpark, change: netChange, label: "MTD", color: netChange >= 0 ? COLOR_GREEN : COLOR_RED }
      : undefined;
    kpis.push({ title: "Net Cash Flow", value: formatCurrency(netCashFlow), tooltip: "Credits minus debits for the current month", sparkline: netSparkline });
  }

  return kpis;
}

// --- View toggle ---

type ViewMode = "list" | "grid";
const VIEW_OPTIONS = [
  { value: "list" as const, label: "List" },
  { value: "grid" as const, label: "Grid" },
];

// --- Main ---

interface AccountWithProfile {
  account: Account;
  latestBalance: Balance | null;
  allBalances: Balance[];
}

export function AccountTypePage() {
  const { typeSlug } = useParams<{ typeSlug: string }>();
  const [accountsWithProfiles, setAccountsWithProfiles] = useState<AccountWithProfile[]>([]);
  const [mtdData, setMtdData] = useState<MtdData | undefined>(undefined);
  const [marketRates, setMarketRates] = useState<MortgageRatesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const group = ACCOUNT_TYPE_GROUPS.find((g) => g.slug === typeSlug);

  const loadData = useCallback(async () => {
    if (!group) return;
    setIsLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        group.types.map((t) => fetchAccounts(t)),
      );
      const allAccounts = results.flatMap((r) => r.accounts);

      const withProfiles = await Promise.all(
        allAccounts.map(async (account) => {
          try {
            const { balances } = await fetchBalances(account.id);
            return { account, latestBalance: balances[0] ?? null, allBalances: balances };
          } catch {
            return { account, latestBalance: null, allBalances: [] };
          }
        }),
      );

      setAccountsWithProfiles(withProfiles);

      // Fetch MTD transaction data for checking accounts
      if (group.slug === "checking" && allAccounts.length > 0) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const fmt = (d: Date) => d.toISOString().split("T")[0];

        const txnResults = await Promise.all(
          allAccounts.flatMap((account) => [
            fetchTransactions({
              accountId: account.id,
              startDate: fmt(startOfMonth),
              endDate: fmt(now),
              limit: 1000,
            }),
            fetchTransactions({
              accountId: account.id,
              startDate: fmt(startOfPrevMonth),
              endDate: fmt(new Date(startOfMonth.getTime() - 1)),
              limit: 1000,
            }),
          ]),
        );

        let mtdDebits = 0;
        let mtdCredits = 0;
        let prevMtdDebits = 0;
        let prevMtdCredits = 0;
        const currentMonthTxns: { date: string; amount: number }[] = [];

        for (let i = 0; i < allAccounts.length; i++) {
          const currentMonth = txnResults[i * 2].transactions;
          const prevMonth = txnResults[i * 2 + 1].transactions;

          for (const txn of currentMonth) {
            if (txn.amount < 0) mtdDebits += Math.abs(txn.amount);
            else mtdCredits += txn.amount;
            currentMonthTxns.push({ date: txn.date, amount: txn.amount });
          }
          for (const txn of prevMonth) {
            if (txn.amount < 0) prevMtdDebits += Math.abs(txn.amount);
            else prevMtdCredits += txn.amount;
          }
        }

        currentMonthTxns.sort((a, b) => a.date.localeCompare(b.date));
        setMtdData({ mtdDebits, mtdCredits, prevMtdDebits, prevMtdCredits, currentMonthTxns });
      } else {
        setMtdData(undefined);
      }
    } catch {
      setError("Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  }, [group]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (group?.slug === "real-estate") {
      fetchMortgageRates().then(setMarketRates).catch(() => {});
    }
  }, [group?.slug]);

  const kpis = useMemo(() => {
    if (!group || accountsWithProfiles.length === 0) return [];
    return computeKpis(group.slug, accountsWithProfiles, mtdData);
  }, [group, accountsWithProfiles, mtdData]);

  const showRecentTransactions = group?.slug === "checking" || group?.slug === "credit";

  if (!group) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-center text-muted-foreground py-12">
          Unknown account type. <Link to="/settings" className="text-primary hover:underline">Go to Settings</Link> to manage your accounts.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-center text-muted py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">{group.label}</h1>
        <div className="flex items-center gap-2">
          <TabSwitcher options={VIEW_OPTIONS} value={viewMode} onChange={setViewMode} size="sm" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowPdfImport(true)}
          >
            <FileUp className="h-4 w-4" />
            Import Statement
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {/* KPI row */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.title} title={kpi.title} value={kpi.value} tooltip={kpi.tooltip} trend={kpi.trend} sparkline={kpi.sparkline} />
          ))}
        </div>
      )}

      {accountsWithProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No {group.label.toLowerCase()} accounts yet.{" "}
              <Link to="/settings" className="text-primary hover:underline">
                Add one in Settings
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        /* --- Grid View --- */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accountsWithProfiles.map(({ account }, index) => (
            <AccountBalanceCard
              key={account.id}
              accountId={account.id}
              colorIndex={index}
              subtitle={account.institution || undefined}
              badge={account.interestRate != null ? `${formatPercent(account.interestRate)} APR` : undefined}
              defaultRange="12m"
              trendMode={group.slug === "checking" || group.slug === "savings" || group.slug === "credit" ? "mom" : "period"}
            />
          ))}
        </div>
      ) : (
        /* --- List View --- */
        accountsWithProfiles.map(({ account, latestBalance }, index) => {
          return (
          <div key={account.id} className="flex flex-col gap-4">
            {/* Credit: chart + profile + transactions inline */}
            {group.slug === "credit" ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6">
                  <AccountBalanceCard
                    accountId={account.id}
                    colorIndex={index}
                    subtitle={account.institution || undefined}
                    defaultRange="12m"
                    className="h-full"
                    trendMode="mom"
                  />
                </div>
                <div className="lg:col-span-3">
                  {latestBalance?.creditProfile && hasProfileData(latestBalance.creditProfile) ? (
                    <CreditProfileTiered profile={latestBalance.creditProfile} account={account} className="h-full" />
                  ) : (
                    <Card className="h-full flex items-center justify-center">
                      <CardContent className="py-8">
                        <p className="text-sm text-muted-foreground text-center">No profile data</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
                <div className="lg:col-span-3">
                  <RecentTransactionsCard accountId={account.id} className="h-full" />
                </div>
              </div>
            ) : (group.slug === "loans" || group.slug === "real-estate") ? (
              /* Loans/Real Estate: chart + profile inline */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-9">
                  <AccountBalanceCard
                    accountId={account.id}
                    colorIndex={index}
                    subtitle={account.institution || undefined}
                    badge={account.interestRate != null ? `${formatPercent(account.interestRate)} APR` : undefined}
                    defaultRange="12m"
                    className="h-full"
                    trendMode="period"
                  />
                </div>
                <div className="lg:col-span-3">
                  {latestBalance?.loanProfile && hasProfileData(latestBalance.loanProfile) ? (
                    <LoanProfileTiered profile={latestBalance.loanProfile} account={account} className="h-full" marketRates={group.slug === "real-estate" ? marketRates : undefined} />
                  ) : (
                    <Card className="h-full flex items-center justify-center">
                      <CardContent className="py-8">
                        <p className="text-sm text-muted-foreground text-center">No profile data</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            ) : group.slug === "investments" ? (
              /* Investments: chart + profile inline */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-9">
                  <AccountBalanceCard
                    accountId={account.id}
                    colorIndex={index}
                    subtitle={account.institution || undefined}
                    defaultRange="12m"
                    className="h-full"
                    trendMode="period"
                  />
                </div>
                <div className="lg:col-span-3">
                  {latestBalance?.investmentProfile && hasProfileData(latestBalance.investmentProfile) ? (
                    <InvestmentProfileTiered profile={latestBalance.investmentProfile} className="h-full" />
                  ) : (
                    <Card className="h-full flex items-center justify-center">
                      <CardContent className="py-8">
                        <p className="text-sm text-muted-foreground text-center">No profile data</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            ) : showRecentTransactions ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <AccountBalanceCard
                    accountId={account.id}
                    colorIndex={index}
                    subtitle={account.institution || undefined}
                    badge={account.interestRate != null ? `${formatPercent(account.interestRate)} APR` : undefined}
                    defaultRange="12m"
                    className="h-full"
                    trendMode={group.slug === "checking" || group.slug === "savings" ? "mom" : "period"}
                  />
                </div>
                <div className="lg:col-span-1">
                  <RecentTransactionsCard accountId={account.id} className="h-full" />
                </div>
              </div>
            ) : (
              <AccountBalanceCard
                accountId={account.id}
                colorIndex={index}
                subtitle={account.institution || undefined}
                badge={account.interestRate != null ? `${formatPercent(account.interestRate)} APR` : undefined}
                defaultRange="12m"
                trendMode={group.slug === "savings" ? "mom" : "period"}
              />
            )}

          </div>
          );
        })
      )}

      {showPdfImport && (
        <PdfImportDialog
          onClose={() => setShowPdfImport(false)}
          onImported={() => {
            setShowPdfImport(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

/** Check if a profile object has any non-period data fields set */
function hasProfileData(profile: object): boolean {
  return Object.entries(profile).some(
    ([key, value]) =>
      key !== "periodStart" && key !== "periodEnd" && value != null,
  );
}
