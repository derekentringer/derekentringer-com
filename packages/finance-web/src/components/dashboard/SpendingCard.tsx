import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { SpendingSummary } from "@derekentringer/shared/finance";
import { getCategoryColor, formatCurrencyFull } from "@/lib/chartTheme";

interface SpendingCardProps {
  data: SpendingSummary;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
    label?: string;
    invertColor?: boolean;
  };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-card p-2 text-sm shadow-md">
      <p style={{ color: item.payload.fill }}>
        {item.name}: {formatCurrencyFull(item.value)}
      </p>
    </div>
  );
}

export function SpendingCard({ data, trend }: SpendingCardProps) {
  const isPositive = trend?.invertColor
    ? trend.direction === "down"
    : trend?.direction === "up";
  const isNegative = trend?.invertColor
    ? trend.direction === "up"
    : trend?.direction === "down";
  const chartData = useMemo(() => {
    if (data.categories.length <= 7) {
      return data.categories.map((c, i) => ({
        name: c.category,
        value: c.amount,
        fill: getCategoryColor(i),
      }));
    }

    const top6 = data.categories.slice(0, 6);
    const otherTotal = data.categories
      .slice(6)
      .reduce((s, c) => s + c.amount, 0);

    return [
      ...top6.map((c, i) => ({
        name: c.category,
        value: c.amount,
        fill: getCategoryColor(i),
      })),
      {
        name: "Other",
        value: Math.round(otherTotal * 100) / 100,
        fill: "#64748b",
      },
    ];
  }, [data.categories]);

  if (data.total === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Spending</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No spending data this month.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Spending</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {formatCurrencyFull(data.total)} total
            </span>
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  isPositive
                    ? "bg-success/10 text-success"
                    : isNegative
                      ? "bg-destructive/10 text-destructive"
                      : "bg-white/10 text-foreground/70",
                )}
              >
                {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192"} {trend.value}
              </span>
            )}
            {trend?.label && (
              <span className="text-xs text-muted-foreground">
                {trend.label}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Pie chart — hidden on small screens */}
          <div className="hidden sm:block w-[180px] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Category legend */}
          <div className="flex-1">
            {chartData.map((entry, i) => (
              <div
                key={entry.name}
                className={cn(
                  "flex items-center justify-between text-sm px-2 py-0.5 rounded",
                  i % 2 === 0 && "bg-white/[0.03]",
                )}
              >
                <div className="flex items-center gap-2 truncate mr-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="truncate">{entry.name}</span>
                </div>
                <span className="text-muted-foreground whitespace-nowrap">
                  {formatCurrencyFull(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
