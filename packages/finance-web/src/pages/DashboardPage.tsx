import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import type {
  NetWorthResponse,
  SpendingSummary,
  DashboardUpcomingBillsResponse,
} from "@derekentringer/shared/finance";
import { fetchNetWorth, fetchSpendingSummary, fetchUpcomingBills } from "@/api/dashboard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { NetWorthCard } from "@/components/dashboard/NetWorthCard";
import { AccountBalanceCard } from "@/components/dashboard/AccountBalanceCard";
import { SpendingCard } from "@/components/dashboard/SpendingCard";
import { UpcomingBillsCard } from "@/components/dashboard/UpcomingBillsCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/chartTheme";

function SkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-3 bg-skeleton rounded w-24" />
          <div className="h-7 bg-skeleton rounded w-32" />
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonChartCard({ height = "h-[350px]" }: { height?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-skeleton rounded w-32" />
          <div className={`bg-skeleton rounded ${height}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <p className="text-sm text-destructive mb-2">{message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null);
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [prevSpending, setPrevSpending] = useState<SpendingSummary | null>(null);
  const [upcomingBills, setUpcomingBills] =
    useState<DashboardUpcomingBillsResponse | null>(null);

  const [netWorthLoading, setNetWorthLoading] = useState(true);
  const [spendingLoading, setSpendingLoading] = useState(true);
  const [billsLoading, setBillsLoading] = useState(true);

  const [netWorthError, setNetWorthError] = useState("");
  const [spendingError, setSpendingError] = useState("");
  const [billsError, setBillsError] = useState("");

  const loadNetWorth = useCallback(async () => {
    setNetWorthLoading(true);
    setNetWorthError("");
    try {
      const data = await fetchNetWorth("all", "weekly");
      setNetWorth(data);
    } catch {
      setNetWorthError("Failed to load net worth");
    } finally {
      setNetWorthLoading(false);
    }
  }, []);

  const loadSpending = useCallback(async () => {
    setSpendingLoading(true);
    setSpendingError("");
    try {
      const data = await fetchSpendingSummary();
      setSpending(data);

      // Fetch previous month for trend comparison
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      try {
        const prevData = await fetchSpendingSummary(prevMonth);
        setPrevSpending(prevData);
      } catch {
        setPrevSpending(null);
      }
    } catch {
      setSpendingError("Failed to load spending");
    } finally {
      setSpendingLoading(false);
    }
  }, []);

  const loadBills = useCallback(async () => {
    setBillsLoading(true);
    setBillsError("");
    try {
      const data = await fetchUpcomingBills(30);
      setUpcomingBills(data);
    } catch {
      setBillsError("Failed to load upcoming bills");
    } finally {
      setBillsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNetWorth();
    loadSpending();
    loadBills();
  }, [loadNetWorth, loadSpending, loadBills]);

  // Compute net worth month-over-month trend from history
  const netWorthTrend = useMemo(() => {
    if (!netWorth || netWorth.history.length < 2) return undefined;
    const current = netWorth.history[netWorth.history.length - 1].netWorth;
    const previous = netWorth.history[netWorth.history.length - 2].netWorth;
    if (previous === 0) return { direction: "neutral" as const, value: "0.0%", label: "vs last month" };
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%", label: "vs last month" };
    return {
      direction: pct >= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
      label: "vs last month",
    };
  }, [netWorth]);

  // Compute spending month-over-month trend (inverted: spending up = bad)
  const spendingTrend = useMemo(() => {
    if (!spending || !prevSpending || prevSpending.total === 0) return undefined;
    const pct = ((spending.total - prevSpending.total) / prevSpending.total) * 100;
    if (Math.abs(pct) < 0.05) return { direction: "neutral" as const, value: "0.0%", label: "vs last month" };
    return {
      direction: pct <= 0 ? ("up" as const) : ("down" as const),
      value: `${Math.abs(pct).toFixed(1)}%`,
      label: "vs last month",
    };
  }, [spending, prevSpending]);

  // Find favorited account IDs once netWorth loads
  const favoriteAccountIds = useMemo(() => {
    if (!netWorth) return [];
    return netWorth.summary.accounts.filter((a) => a.isFavorite).map((a) => a.id);
  }, [netWorth]);

  // Empty state: no accounts
  if (
    !netWorthLoading &&
    !netWorthError &&
    netWorth &&
    netWorth.summary.accounts.length === 0
  ) {
    return (
      <div className="p-4 md:p-8">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">
              Add your first account to get started.
            </p>
            <Link to="/accounts">
              <Button>Go to Accounts</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      {/* KPI summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {netWorthLoading ? (
          <SkeletonCard />
        ) : netWorthError ? (
          <ErrorCard message={netWorthError} onRetry={loadNetWorth} />
        ) : netWorth ? (
          <KpiCard title="Net Worth" value={formatCurrency(netWorth.summary.netWorth)} trend={netWorthTrend} />
        ) : null}

        {spendingLoading ? (
          <SkeletonCard />
        ) : spendingError ? (
          <ErrorCard message={spendingError} onRetry={loadSpending} />
        ) : spending ? (
          <KpiCard title="Monthly Spending" value={formatCurrency(spending.total)} trend={spendingTrend} />
        ) : null}

        {billsLoading ? (
          <SkeletonCard />
        ) : billsError ? (
          <ErrorCard message={billsError} onRetry={loadBills} />
        ) : upcomingBills ? (
          <KpiCard
            title="Bills Due"
            value={formatCurrency(upcomingBills.totalDue)}
            trend={
              upcomingBills.overdueCount > 0
                ? {
                    direction: "down",
                    value: `${upcomingBills.overdueCount} overdue`,
                  }
                : undefined
            }
          />
        ) : null}
      </div>

      {/* Net worth chart - full width */}
      {netWorthLoading ? (
        <SkeletonChartCard />
      ) : netWorthError ? (
        <ErrorCard message={netWorthError} onRetry={loadNetWorth} />
      ) : netWorth ? (
        <NetWorthCard data={netWorth} />
      ) : null}

      {/* Bottom row: Spending + Upcoming Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {spendingLoading ? (
          <SkeletonChartCard height="h-[200px]" />
        ) : spendingError ? (
          <ErrorCard message={spendingError} onRetry={loadSpending} />
        ) : spending ? (
          <SpendingCard data={spending} trend={spendingTrend} />
        ) : null}

        {billsLoading ? (
          <SkeletonChartCard height="h-[200px]" />
        ) : billsError ? (
          <ErrorCard message={billsError} onRetry={loadBills} />
        ) : upcomingBills ? (
          <UpcomingBillsCard data={upcomingBills} />
        ) : null}
      </div>

      {/* Favorite account balance charts */}
      {favoriteAccountIds.map((id) => (
        <AccountBalanceCard key={id} accountId={id} />
      ))}
    </div>
  );
}
