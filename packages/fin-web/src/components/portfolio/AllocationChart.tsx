import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { AssetAllocationResponse } from "@derekentringer/shared/finance";
import { getCategoryColor, formatCurrencyFull } from "@/lib/chartTheme";

interface AllocationChartProps {
  data: AssetAllocationResponse;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string; targetPct?: number; drift?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-card p-2 text-sm shadow-md">
      <p style={{ color: item.payload.fill }}>
        {item.name}: {formatCurrencyFull(item.value)}
      </p>
      {item.payload.targetPct !== undefined && (
        <p className="text-muted-foreground text-xs">
          Target: {item.payload.targetPct.toFixed(1)}%
        </p>
      )}
    </div>
  );
}

export function AllocationChart({ data }: AllocationChartProps) {
  const chartData = useMemo(() => {
    return data.slices
      .filter((s) => s.marketValue > 0)
      .map((s, i) => ({
        name: s.label,
        value: s.marketValue,
        fill: getCategoryColor(i),
        percentage: s.percentage,
        targetPct: s.targetPct,
        drift: s.drift,
      }));
  }, [data.slices]);

  if (data.totalMarketValue === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Asset Allocation</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No holdings with market values to display.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Asset Allocation</h2>
          <span className="text-sm font-bold text-foreground">
            {formatCurrencyFull(data.totalMarketValue)} total
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Donut chart */}
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

          {/* Legend with current % and target % */}
          <div className="flex-1">
            {chartData.map((entry, i) => (
              <div
                key={entry.name}
                className={cn(
                  "flex items-center justify-between text-sm px-2 py-1 rounded",
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
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span className="text-foreground font-medium">
                    {entry.percentage.toFixed(1)}%
                  </span>
                  {entry.targetPct !== undefined && (
                    <>
                      <span className="text-muted-foreground text-xs">
                        target {entry.targetPct.toFixed(1)}%
                      </span>
                      {entry.drift !== undefined && Math.abs(entry.drift) >= 1 && (
                        <span className={cn(
                          "text-xs font-medium",
                          entry.drift > 0 ? "text-red-400" : "text-green-400",
                        )}>
                          {entry.drift > 0 ? "+" : ""}{entry.drift.toFixed(1)}%
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
