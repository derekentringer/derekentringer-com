import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
    label?: string;
    invertColor?: boolean;
  };
  sparkline?: {
    data: number[];
    change: number;
    label: string;
    color: string;
    invertColor?: boolean;
  };
  className?: string;
}

export function KpiCard({ title, value, trend, sparkline, className }: KpiCardProps) {
  // For text-based trend
  const isPositive = trend?.invertColor
    ? trend.direction === "down"
    : trend?.direction === "up";
  const isNegative = trend?.invertColor
    ? trend.direction === "up"
    : trend?.direction === "down";

  // For sparkline trend
  const sparkIsPositive = sparkline
    ? sparkline.invertColor
      ? sparkline.change < 0
      : sparkline.change > 0
    : false;
  const sparkIsNegative = sparkline
    ? sparkline.invertColor
      ? sparkline.change > 0
      : sparkline.change < 0
    : false;

  const sparkArrow = sparkline
    ? sparkline.change > 0 ? "↗" : sparkline.change < 0 ? "↘" : "→"
    : "";

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <p className="text-xs text-foreground">{title}</p>
        {sparkline && sparkline.data.length >= 2 ? (
          <div className="flex items-center gap-2 sm:gap-3 mt-1">
            <p className="text-lg sm:text-2xl font-bold">{value}</p>
            <div className="w-px h-10 bg-border" />
            <div className="flex flex-col items-start gap-0.5">
              <Sparkline data={sparkline.data} color={sparkline.color} width={72} height={28} />
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "text-xs font-medium",
                    sparkIsPositive
                      ? "text-success"
                      : sparkIsNegative
                        ? "text-destructive"
                        : "text-foreground/70",
                  )}
                >
                  {sparkArrow} {sparkline.change > 0 ? "+" : ""}{sparkline.change.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">{sparkline.label}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg sm:text-2xl font-bold mt-1">{value}</p>
            {trend && (
              <div className="flex items-center gap-1.5 mt-1">
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
                {trend.label && (
                  <span className="text-xs text-muted-foreground">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
