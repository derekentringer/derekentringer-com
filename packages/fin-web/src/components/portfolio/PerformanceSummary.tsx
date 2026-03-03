import type { PerformanceSummary as PerformanceSummaryData } from "@derekentringer/shared/finance";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { formatCurrencyFull } from "@/lib/chartTheme";

interface PerformanceSummaryProps {
  data: PerformanceSummaryData;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function PerformanceSummary({ data }: PerformanceSummaryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total Value"
        value={formatCurrencyFull(data.totalValue)}
        tooltip="Current market value of all holdings"
      />
      <KpiCard
        title="Total Return ($)"
        value={formatCurrencyFull(data.totalReturn)}
        tooltip="Total gain or loss in dollar terms"
        trend={data.totalReturn !== 0 ? {
          direction: data.totalReturn >= 0 ? "up" : "down",
          value: formatCurrencyFull(Math.abs(data.totalReturn)),
        } : undefined}
      />
      <KpiCard
        title="Total Return (%)"
        value={formatPercent(data.totalReturnPct)}
        tooltip="Total return as a percentage of cost basis"
        trend={data.totalReturnPct !== 0 ? {
          direction: data.totalReturnPct >= 0 ? "up" : "down",
          value: formatPercent(data.totalReturnPct),
        } : undefined}
      />
      {data.benchmarkReturnPct !== undefined && (
        <KpiCard
          title="Benchmark (SPY)"
          value={formatPercent(data.benchmarkReturnPct)}
          tooltip="S&P 500 (SPY) return over the same period"
          trend={data.benchmarkReturnPct !== 0 ? {
            direction: data.benchmarkReturnPct >= 0 ? "up" : "down",
            value: formatPercent(data.benchmarkReturnPct),
          } : undefined}
        />
      )}
    </div>
  );
}
