import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import type { GoalProgressResponse } from "@derekentringer/shared/finance";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import { fetchGoalProgress } from "@/api/goals.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/chartTheme";

const TYPE_COLORS: Record<string, string> = {
  savings: "#22c55e",
  debt_payoff: "#ef4444",
  net_worth: "#2563eb",
  custom: "#f59e0b",
};

const MAX_GOALS_SHOWN = 5;

export function GoalsSummaryCard() {
  const [data, setData] = useState<GoalProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchGoalProgress({ months: 60 });
      setData(result);
    } catch {
      setError("Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Don't render anything if there are no goals
  if (!loading && !error && data && data.goals.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-skeleton rounded w-16" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 bg-skeleton rounded flex-1" />
                  <div className="h-3 bg-skeleton rounded w-16" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-sm text-destructive mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.goals.length === 0) return null;

  const goals = data.goals.slice(0, MAX_GOALS_SHOWN);
  const hasMore = data.goals.length > MAX_GOALS_SHOWN;

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Goals</h3>
          <Link to="/goals" className="text-xs text-muted-foreground hover:text-foreground no-underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-3">
          {goals.map((goal) => {
            const typeColor = TYPE_COLORS[goal.goalType] ?? "#94a3b8";
            const percent = Math.min(goal.percentComplete, 100);

            return (
              <div key={goal.goalId} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-foreground truncate">{goal.goalName}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 shrink-0"
                      style={{ borderColor: typeColor, color: typeColor }}
                    >
                      {GOAL_TYPE_LABELS[goal.goalType] ?? goal.goalType}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: typeColor,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{formatCurrency(goal.currentAmount)}</span>
                  <span>
                    {goal.projectedCompletionDate
                      ? `Est. ${goal.projectedCompletionDate}`
                      : "No date"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <Link
            to="/goals"
            className="block text-center text-xs text-muted-foreground hover:text-foreground mt-3 no-underline"
          >
            +{data.goals.length - MAX_GOALS_SHOWN} more goals
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
