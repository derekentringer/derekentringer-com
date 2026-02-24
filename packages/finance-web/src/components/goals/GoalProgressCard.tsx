import type { GoalProgress } from "@derekentringer/shared/finance";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Line,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, GripVertical } from "lucide-react";
import { formatCurrency } from "@/lib/chartTheme";
import { CHART_COLORS } from "@/lib/chartTheme";

const TYPE_COLORS: Record<string, string> = {
  savings: "#22c55e",
  debt_payoff: "#ef4444",
  net_worth: "#2563eb",
  custom: "#f59e0b",
};

function getStatusBadge(progress: GoalProgress) {
  if (progress.percentComplete >= 100) {
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Complete</Badge>;
  }
  if (progress.onTrack) {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">On Track</Badge>;
  }
  if (progress.projectedCompletionDate) {
    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">At Risk</Badge>;
  }
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Off Track</Badge>;
}

interface GoalProgressCardProps {
  progress: GoalProgress;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps?: Record<string, unknown>;
}

export function GoalProgressCard({
  progress,
  onEdit,
  onDelete,
  dragHandleProps,
}: GoalProgressCardProps) {
  const typeColor = TYPE_COLORS[progress.goalType] ?? "#94a3b8";
  const percentComplete = Math.min(progress.percentComplete, 100);

  // Trim projection to a few months past target completion
  // so the chart is focused on the journey to the goal, not the overshoot
  const isDebtPayoff = progress.goalType === "debt_payoff";
  const trimmedProjection = (() => {
    if (!progress.projectedCompletionDate) return progress.projection;
    const completionIdx = progress.projection.findIndex(
      (p) => p.month >= progress.projectedCompletionDate!,
    );
    if (completionIdx === -1) return progress.projection;
    // Keep a few months past completion for visual context
    const endIdx = Math.min(completionIdx + 3, progress.projection.length);
    return progress.projection.slice(0, endIdx);
  })();

  // Thin out chart data for display — show max 24 points
  // Always preserve historical points (where actual is defined) so the colored line renders
  const thinned = trimmedProjection.length > 24
    ? trimmedProjection.filter(
        (p, i) =>
          p.actual != null ||
          i === 0 ||
          i === trimmedProjection.length - 1 ||
          i % Math.ceil(trimmedProjection.length / 24) === 0,
      )
    : trimmedProjection;

  const chartData = thinned;

  // Check if we have historical data (any point with actual defined)
  const hasHistory = chartData.some((p) => p.actual != null);

  // Y axis domain: target + 20% headroom, considering all visible data
  const yMax = Math.ceil(Math.max(
    progress.targetAmount,
    ...thinned.map((p) => p.projected),
    ...thinned.map((p) => p.actual ?? 0),
    ...thinned.map((p) => p.minimumOnly ?? 0),
  ) * 1.2);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {dragHandleProps && (
              <button type="button" className="cursor-grab text-muted" {...dragHandleProps}>
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="font-medium text-foreground truncate">{progress.goalName}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                  style={{ borderColor: typeColor, color: typeColor }}
                >
                  {GOAL_TYPE_LABELS[progress.goalType] ?? progress.goalType}
                </Badge>
                {getStatusBadge(progress)}
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{formatCurrency(progress.currentAmount)}</span>
            <span>{formatCurrency(progress.targetAmount)}</span>
          </div>
          <div className="h-2 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${percentComplete}%`,
                backgroundColor: typeColor,
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-1 text-center">
            {percentComplete.toFixed(1)}%
          </div>
        </div>

        {/* Mini chart */}
        {chartData.length > 1 && (
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`goalGrad-${progress.goalId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={typeColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={typeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: CHART_COLORS.text }}
                  tickFormatter={(v: string) => v.substring(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: CHART_COLORS.text }}
                  tickFormatter={(v: number) => formatCurrency(v)}
                  width={55}
                  domain={[0, yMax]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1b23", border: "1px solid #2e2f3a" }}
                  labelStyle={{ color: "#999" }}
                  formatter={(value: number | undefined, name?: string) => {
                    if (name === "minimumOnly") return [formatCurrency(value ?? 0), "Min. Payment"];
                    if (name === "actual") return [formatCurrency(value ?? 0), "Actual"];
                    if (isDebtPayoff) return [formatCurrency(value ?? 0), "With Extra"];
                    return [formatCurrency(value ?? 0), "Projected"];
                  }}
                />
                <ReferenceLine
                  y={isDebtPayoff ? 0 : progress.targetAmount}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{
                    value: isDebtPayoff ? "Paid Off" : "Target",
                    position: "right",
                    fill: "#94a3b8",
                    fontSize: 10,
                  }}
                />
                {isDebtPayoff && (
                  <Line
                    type="monotone"
                    dataKey="minimumOnly"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke="#94a3b8"
                  fill="none"
                  strokeWidth={1.5}
                  dot={false}
                />
                {hasHistory ? (
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke={typeColor}
                    fill={`url(#goalGrad-${progress.goalId})`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                ) : (
                  chartData.length > 0 && (
                    <ReferenceDot
                      x={chartData[0].month}
                      y={chartData[0].projected}
                      r={4}
                      fill={typeColor}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  )
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Monthly</div>
            <div className="font-medium text-foreground">
              {progress.monthlyContribution > 0
                ? formatCurrency(progress.monthlyContribution)
                : "Manual"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Target Date</div>
            <div className="font-medium text-foreground">
              {progress.targetDate ?? "None"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Projected</div>
            <div className="font-medium text-foreground">
              {progress.projectedCompletionDate ?? "N/A"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Progress</div>
            <div className="font-medium text-foreground">
              {formatCurrency(progress.currentAmount)} / {formatCurrency(progress.targetAmount)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
