import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
    label?: string;
  };
  className?: string;
}

export function KpiCard({ title, value, trend, className }: KpiCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <p className="text-xs text-foreground">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {trend && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                trend.direction === "up"
                  ? "bg-success/10 text-success"
                  : trend.direction === "down"
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
      </CardContent>
    </Card>
  );
}
