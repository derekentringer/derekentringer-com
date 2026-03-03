import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { AiInsight } from "@derekentringer/shared/finance";
import { fetchAiPreferences, fetchAiInsights } from "../../api/ai.ts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Eye, Lightbulb, AlertTriangle, PartyPopper, Brain } from "lucide-react";

const TYPE_ICONS: Record<string, typeof Eye> = {
  observation: Eye,
  recommendation: Lightbulb,
  alert: AlertTriangle,
  celebration: PartyPopper,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "border-l-blue-400",
  warning: "border-l-yellow-400",
  success: "border-l-green-400",
};

function getLastCompletedMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getLastCompletedQuarter(): string {
  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  let year = now.getFullYear();
  let q = currentQ - 1;
  if (q < 1) { q = 4; year--; }
  return `${year}-Q${q}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

function formatQuarterLabel(quarter: string): string {
  const [year, q] = quarter.split("-");
  return `${q} ${year}`;
}

function navigateMonth(month: string, direction: -1 | 1): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + direction, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function navigateQuarter(quarter: string, direction: -1 | 1): string {
  const [yearStr, qStr] = quarter.split("-Q");
  let year = parseInt(yearStr, 10);
  let q = parseInt(qStr, 10) + direction;
  if (q < 1) { q = 4; year--; }
  if (q > 4) { q = 1; year++; }
  return `${year}-Q${q}`;
}

export function AiDigest({ type }: { type: "monthly" | "quarterly" }) {
  const maxPeriod = type === "monthly" ? getLastCompletedMonth() : getLastCompletedQuarter();
  const [period, setPeriod] = useState(() => maxPeriod);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setPeriod(type === "monthly" ? getLastCompletedMonth() : getLastCompletedQuarter());
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError("");

    async function load() {
      try {
        const prefData = await fetchAiPreferences();
        if (cancelled) return;

        const featureKey = type === "monthly" ? "monthlyDigest" : "quarterlyDigest";
        if (!prefData.preferences.masterEnabled || !prefData.preferences[featureKey]) {
          setEnabled(false);
          setIsLoading(false);
          return;
        }
        setEnabled(true);

        const scope = type === "monthly" ? "monthly-digest" : "quarterly-digest";
        const options = type === "monthly" ? { month: period } : { quarter: period };
        const data = await fetchAiInsights(scope, options);
        if (cancelled) return;
        setInsights(data.insights);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load digest");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [type, period]);

  function handleNav(direction: -1 | 1) {
    setPeriod((prev) =>
      type === "monthly" ? navigateMonth(prev, direction) : navigateQuarter(prev, direction),
    );
  }

  if (!enabled && !isLoading) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">
            AI Insights are disabled. Enable them to generate {type} digests.
          </p>
          <Link to="/settings/ai-insights">
            <Button variant="secondary" size="sm">Go to Settings</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Period navigator */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => handleNav(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-medium min-w-[180px] text-center">
          {type === "monthly" ? formatMonthLabel(period) : formatQuarterLabel(period)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleNav(1)}
          disabled={period >= maxPeriod}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-skeleton rounded w-48" />
              <div className="h-20 bg-skeleton rounded" />
              <div className="h-20 bg-skeleton rounded" />
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : insights.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No insights available for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {insights.map((insight) => {
            const Icon = TYPE_ICONS[insight.type] ?? Eye;
            const borderColor = SEVERITY_COLORS[insight.severity] ?? "border-l-border";

            return (
              <Card key={insight.id}>
                <CardContent className="p-4">
                  <div className={`border-l-4 ${borderColor} pl-3 py-1`}>
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground">{insight.title}</span>
                          <Badge variant="outline" className="text-xs">AI-generated</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{insight.body}</p>
                        {insight.relatedPage && (
                          <Link
                            to={insight.relatedPage}
                            className="text-xs text-primary hover:underline mt-2 inline-block"
                          >
                            View details
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      {insights.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          AI-generated insights — not professional financial advice
        </p>
      )}
    </div>
  );
}
