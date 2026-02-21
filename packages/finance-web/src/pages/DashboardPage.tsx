import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import type {
  NetWorthResponse,
  SpendingSummary,
  DashboardUpcomingBillsResponse,
  DailySpendingResponse,
} from "@derekentringer/shared/finance";
import { fetchNetWorth, fetchSpendingSummary, fetchUpcomingBills, fetchDailySpending } from "@/api/dashboard";
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
  const [dailyNetWorth, setDailyNetWorth] = useState<NetWorthResponse | null>(null);
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [dailySpending, setDailySpending] = useState<DailySpendingResponse | null>(null);
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
      const [data, dailyData] = await Promise.all([
        fetchNetWorth("12m", "weekly"),
        fetchNetWorth("1m", "daily"),
      ]);
      setNetWorth(data);
      setDailyNetWorth(dailyData);
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
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const [data, dailyData] = await Promise.all([
        fetchSpendingSummary(),
        fetchDailySpending(startOfMonth, today),
      ]);
      setSpending(data);
      setDailySpending(dailyData);
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

  // Compute net worth sparkline from daily data
  const netWorthSparkline = useMemo(() => {
    if (!dailyNetWorth || dailyNetWorth.history.length < 2) return undefined;
    const data = dailyNetWorth.history.map((p) => p.netWorth);
    const first = data[0];
    const last = data[data.length - 1];
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    return {
      data,
      change,
      label: "30-Day",
      color: change >= 0 ? "hsl(142.1 76.2% 36.3%)" : "hsl(0 84.2% 60.2%)",
    };
  }, [dailyNetWorth]);

  // Compute spending sparkline from daily spending data
  const spendingSparkline = useMemo(() => {
    if (!dailySpending || dailySpending.points.length < 2) return undefined;
    const data = dailySpending.points.map((p) => p.amount);
    // Compute cumulative spending for sparkline trend
    const cumulative: number[] = [];
    let sum = 0;
    for (const v of data) {
      sum += v;
      cumulative.push(sum);
    }
    const first = cumulative[0];
    const last = cumulative[cumulative.length - 1];
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    return {
      data: cumulative,
      change,
      label: "MTD",
      color: change > 0 ? "hsl(0 84.2% 60.2%)" : "hsl(142.1 76.2% 36.3%)",
      invertColor: true,
    };
  }, [dailySpending]);

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
          <KpiCard title="Net Worth" value={formatCurrency(netWorth.summary.netWorth)} sparkline={netWorthSparkline} />
        ) : null}

        {spendingLoading ? (
          <SkeletonCard />
        ) : spendingError ? (
          <ErrorCard message={spendingError} onRetry={loadSpending} />
        ) : spending ? (
          <KpiCard title="Monthly Spending" value={formatCurrency(spending.total)} sparkline={spendingSparkline} />
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
          <SpendingCard data={spending} />
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
      {favoriteAccountIds.map((id, i) => (
        <AccountBalanceCard key={id} accountId={id} colorIndex={i} />
      ))}
    </div>
  );
}
