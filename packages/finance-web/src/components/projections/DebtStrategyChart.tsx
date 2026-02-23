import type { DebtPayoffStrategyResult, DebtAccountSummary } from "@derekentringer/shared/finance";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, getCategoryColor, formatCurrency, curveStepAfterRounded } from "@/lib/chartTheme";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

function formatMonthLabel(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; payload?: Record<string, unknown> }>;
}) {
  if (!active || !payload?.length) return null;
  const tooltipLabel = (payload[0]?.payload?.tooltipLabel as string) ?? "";
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md max-h-80 overflow-y-auto">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {sorted.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

interface DebtStrategyChartProps {
  result: DebtPayoffStrategyResult;
  debtAccounts: DebtAccountSummary[];
  extraPayment: number;
  label: string;
  color: string;
}

export function DebtStrategyChart({ result, debtAccounts, extraPayment, label, color }: DebtStrategyChartProps) {
  const timelines = result.timelines;
  const schedule = result.aggregateSchedule;

  // Build chart data with per-account balances + aggregate total
  const chartData = schedule.map((point, monthIdx) => {
    const row: Record<string, string | number> = {
      month: formatMonthLabel(point.month),
      tooltipLabel: new Date(point.month + "-15").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      [label]: point.totalBalance,
    };
    for (const tl of timelines) {
      row[tl.name] = tl.schedule[monthIdx]?.balance ?? 0;
    }
    return row;
  });

  // Build legend data — timelines are already sorted in strategy priority order
  const accountMap = new Map(debtAccounts.map((a) => [a.accountId, a]));
  const legendItems = timelines.map((tl, i) => {
    const acct = accountMap.get(tl.accountId);
    return {
      name: tl.name,
      color: getCategoryColor(i),
      interestRate: acct?.interestRate ?? 0,
      balance: acct?.currentBalance ?? 0,
      minimumPayment: acct?.minimumPayment ?? 0,
      monthsToPayoff: tl.monthsToPayoff,
    };
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`gradDebt-${result.strategy}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            {timelines.map((tl, i) => (
              <linearGradient key={tl.accountId} id={`gradDebtAcct-${result.strategy}-${tl.accountId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getCategoryColor(i)} stopOpacity={0.12} />
                <stop offset="100%" stopColor={getCategoryColor(i)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="month"
            stroke={CHART_COLORS.text}
            fontSize={12}
            interval="equidistantPreserveStart"
          />
          <YAxis
            stroke={CHART_COLORS.text}
            fontSize={12}
            tickFormatter={(v) => formatCurrency(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          {timelines.map((tl, i) => (
            <Area
              key={tl.accountId}
              type={curveStepAfterRounded}
              dataKey={tl.name}
              stroke={getCategoryColor(i)}
              fill={`url(#gradDebtAcct-${result.strategy}-${tl.accountId})`}
              fillOpacity={1}
              strokeWidth={1}
            />
          ))}
          <Area
            type={curveStepAfterRounded}
            dataKey={label}
            name={`Total (${label})`}
            stroke={color}
            fill={`url(#gradDebt-${result.strategy})`}
            fillOpacity={1}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Strategy table — priority order with payment details */}
      <div className="mt-3">
        {extraPayment <= 0 && (
          <p className="text-xs text-muted-foreground mb-2 px-1">
            Minimum payments only. Add extra payment above to accelerate.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Payment</TableHead>
              <TableHead className="text-right">Payoff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {legendItems.map((item, i) => (
              <TableRow key={item.name}>
                <TableCell className="py-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">{i + 1}</span>
                  </span>
                </TableCell>
                <TableCell className="py-2 font-medium">{item.name}</TableCell>
                <TableCell className="py-2 text-right text-muted-foreground">{item.interestRate}%</TableCell>
                <TableCell className="py-2 text-right">{formatCurrency(item.balance)}</TableCell>
                <TableCell className="py-2 text-right">
                  {extraPayment > 0 && i === 0 ? (
                    <span title={`${formatCurrency(item.minimumPayment)} min + ${formatCurrency(extraPayment)} extra`}>
                      {formatCurrency(item.minimumPayment + extraPayment)}/mo
                    </span>
                  ) : (
                    <span>{formatCurrency(item.minimumPayment)}/mo</span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right">{item.monthsToPayoff}mo</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="py-2">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                </span>
              </TableCell>
              <TableCell className="py-2 font-medium">Total</TableCell>
              <TableCell className="py-2" />
              <TableCell className="py-2 text-right font-medium">
                {formatCurrency(legendItems.reduce((sum, item) => sum + item.balance, 0))}
              </TableCell>
              <TableCell className="py-2 text-right font-medium">
                {formatCurrency(legendItems.reduce((sum, item) => sum + item.minimumPayment, 0) + extraPayment)}/mo
              </TableCell>
              <TableCell className="py-2" />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
