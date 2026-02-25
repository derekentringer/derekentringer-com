import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import type { AiInsight } from "@derekentringer/shared/finance";
import { fetchAiPreferences, fetchAiInsights } from "../../api/ai.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Eye, Lightbulb, AlertTriangle, PartyPopper, ChevronDown } from "lucide-react";

const SEEN_KEY = "ai-insights-seen-ids";

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

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore corrupt data
  }
  return new Set();
}

function markSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // storage full — non-critical
  }
}

export function AiInsightCard() {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => getSeenIds());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const prefData = await fetchAiPreferences();
        if (cancelled) return;
        if (!prefData.preferences.masterEnabled || !prefData.preferences.dashboardCard) {
          setEnabled(false);
          setIsLoading(false);
          return;
        }
        setEnabled(true);

        const data = await fetchAiInsights("dashboard");
        if (cancelled) return;
        setInsights(data.insights);
      } catch {
        // Non-blocking — silently fail
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const unseenCount = useMemo(
    () => insights.filter((i) => !seenIds.has(i.id)).length,
    [insights, seenIds],
  );

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const willExpand = prev;
      if (willExpand && insights.length > 0) {
        const allIds = insights.map((i) => i.id);
        markSeen(allIds);
        setSeenIds(new Set(allIds));
      }
      return !prev;
    });
  }, [insights]);

  if (!enabled && !isLoading) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-skeleton rounded w-40" />
            <div className="h-16 bg-skeleton rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          onClick={handleToggle}
        >
          <Brain className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium text-foreground">AI Insights</h2>
          <Badge variant="outline" className="text-xs">{insights.length}</Badge>
          {unseenCount > 0 && collapsed && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
      </CardHeader>
      {!collapsed && (
        <CardContent className="flex flex-col gap-3">
          {insights.map((insight) => {
            const Icon = TYPE_ICONS[insight.type] ?? Eye;
            const borderColor = SEVERITY_COLORS[insight.severity] ?? "border-l-border";

            return (
              <div
                key={insight.id}
                className={`border-l-4 ${borderColor} pl-3 py-2`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{insight.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{insight.body}</div>
                    {insight.relatedPage && (
                      <Link
                        to={insight.relatedPage}
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        View details
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
