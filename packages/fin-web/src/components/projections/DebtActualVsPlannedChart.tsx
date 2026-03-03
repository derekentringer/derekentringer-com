import type { DebtActualVsPlanned } from "@derekentringer/shared/finance";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, formatCurrency, curveStepAfterRounded } from "@/lib/chartTheme";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

function formatMonthLong(month: string): string {
  return new Date(month + "-15").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
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
  const filtered = payload.filter((e) => e.value != null);
  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{tooltipLabel}</p>
      {filtered.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

interface DebtActualVsPlannedChartProps {
  data: DebtActualVsPlanned;
  extraPayment: number;
  minimumPayment: number;
  interestRate: number;
}

export function DebtActualVsPlannedChart({ data, extraPayment, minimumPayment, interestRate }: DebtActualVsPlannedChartProps) {
  if (data.actual.length === 0) return null;

  // Merge all three series by month
  const allMonths = new Set<string>();
  for (const p of data.planned) allMonths.add(p.month);
  for (const a of data.actual) allMonths.add(a.month);
  for (const m of data.minimumOnly) allMonths.add(m.month);

  const sortedMonths = [...allMonths].sort();
  const actualMap = new Map(data.actual.map((a) => [a.month, a.balance]));
  const plannedMap = new Map(data.planned.map((p) => [p.month, p.balance]));
  const minOnlyMap = new Map(data.minimumOnly.map((m) => [m.month, m.balance]));

  const chartData = sortedMonths.map((month) => ({
    month: formatMonthLabel(month),
    tooltipLabel: formatMonthLong(month),
    Actual: actualMap.get(month) ?? null,
    "With Extra": plannedMap.get(month) ?? null,
    "Minimum Only": minOnlyMap.get(month) ?? null,
  }));

  // Compute summary stats
  const currentBalance = data.actual[data.actual.length - 1].balance;
  const plannedPayoff = data.planned.length > 0 ? data.planned[data.planned.length - 1] : null;
  const minOnlyPayoff = data.minimumOnly.length > 0 ? data.minimumOnly[data.minimumOnly.length - 1] : null;
  const plannedMonths = data.planned.length - 1; // first month is current
  const minOnlyMonths = data.minimumOnly.length - 1;
  const monthsSaved = minOnlyMonths - plannedMonths;

  // Estimate total interest for each scenario
  const plannedTotalPaid = data.planned.reduce((sum, p, i) => {
    if (i === 0) return sum;
    const prevBal = data.planned[i - 1].balance;
    if (prevBal <= 0) return sum;
    return sum + Math.min(minimumPayment + extraPayment, prevBal + prevBal * (interestRate / 100 / 12));
  }, 0);
  const plannedTotalInterest = plannedTotalPaid - currentBalance + (plannedPayoff?.balance ?? 0);

  const minOnlyTotalPaid = data.minimumOnly.reduce((sum, p, i) => {
    if (i === 0) return sum;
    const prevBal = data.minimumOnly[i - 1].balance;
    if (prevBal <= 0) return sum;
    return sum + Math.min(minimumPayment, prevBal + prevBal * (interestRate / 100 / 12));
  }, 0);
  const minOnlyTotalInterest = minOnlyTotalPaid - currentBalance + (minOnlyPayoff?.balance ?? 0);
  const interestSaved = minOnlyTotalInterest - plannedTotalInterest;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-medium text-foreground">{data.name}</h3>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`gradActual-${data.accountId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.debtActual} stopOpacity={0.15} />
                <stop offset="100%" stopColor={CHART_COLORS.debtActual} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`gradPlanned-${data.accountId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.debtPlanned} stopOpacity={0.08} />
                <stop offset="100%" stopColor={CHART_COLORS.debtPlanned} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`gradMinOnly-${data.accountId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.debtSnowball} stopOpacity={0.08} />
                <stop offset="100%" stopColor={CHART_COLORS.debtSnowball} stopOpacity={0} />
              </linearGradient>
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
            <Area
              type={curveStepAfterRounded}
              dataKey="Minimum Only"
              stroke={CHART_COLORS.debtSnowball}
              strokeDasharray="5 5"
              fill={`url(#gradMinOnly-${data.accountId})`}
              fillOpacity={1}
              strokeWidth={1.5}
              connectNulls
            />
            <Area
              type={curveStepAfterRounded}
              dataKey="With Extra"
              stroke={CHART_COLORS.debtPlanned}
              fill={`url(#gradPlanned-${data.accountId})`}
              fillOpacity={1}
              strokeWidth={1.5}
              connectNulls
            />
            <Area
              type={curveStepAfterRounded}
              dataKey="Actual"
              stroke={CHART_COLORS.debtActual}
              fill={`url(#gradActual-${data.accountId})`}
              fillOpacity={1}
              strokeWidth={2}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Calculation details */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Minimum Only</TableHead>
              <TableHead className="text-right">With Extra</TableHead>
              <TableHead className="text-right">Savings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="py-2 font-medium">Current Balance</TableCell>
              <TableCell className="py-2 text-right" colSpan={3}>{formatCurrency(currentBalance)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-2 font-medium">Monthly Payment</TableCell>
              <TableCell className="py-2 text-right">{formatCurrency(minimumPayment)}/mo</TableCell>
              <TableCell className="py-2 text-right">{formatCurrency(minimumPayment + extraPayment)}/mo</TableCell>
              <TableCell className="py-2 text-right text-muted-foreground">+{formatCurrency(extraPayment)}/mo</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-2 font-medium">Interest Rate</TableCell>
              <TableCell className="py-2 text-right" colSpan={3}>{interestRate}%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-2 font-medium">Payoff Time</TableCell>
              <TableCell className="py-2 text-right">{minOnlyMonths}mo</TableCell>
              <TableCell className="py-2 text-right">{plannedMonths}mo</TableCell>
              <TableCell className="py-2 text-right text-success">{monthsSaved > 0 ? `${monthsSaved}mo faster` : "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="py-2 font-medium">Total Interest</TableCell>
              <TableCell className="py-2 text-right">{formatCurrency(minOnlyTotalInterest)}</TableCell>
              <TableCell className="py-2 text-right">{formatCurrency(plannedTotalInterest)}</TableCell>
              <TableCell className="py-2 text-right text-success">{interestSaved > 0 ? `Save ${formatCurrency(interestSaved)}` : "—"}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
