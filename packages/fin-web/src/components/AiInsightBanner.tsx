import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { AiInsight, AiInsightScope } from "@derekentringer/shared/finance";
import { fetchAiPreferences, fetchAiInsights, markInsightsRead, markInsightsDismissed } from "../api/ai.ts";
import { Badge } from "@/components/ui/badge";
import { Eye, Lightbulb, AlertTriangle, PartyPopper, X } from "lucide-react";

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

export function AiInsightBanner({ scope }: { scope: AiInsightScope }) {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const prefData = await fetchAiPreferences();
        if (cancelled) return;
        if (!prefData.preferences.masterEnabled || !prefData.preferences.pageNudges) return;

        const data = await fetchAiInsights(scope);
        if (cancelled) return;

        // Filter out already-dismissed insights using server statuses
        const dismissedIds = new Set(
          (data.statuses ?? []).filter((s) => s.isDismissed).map((s) => s.insightId),
        );
        const visibleInsights = data.insights.filter((i) => !dismissedIds.has(i.id)).slice(0, 2);
        setInsights(visibleInsights);

        if (visibleInsights.length > 0) {
          setVisible(true);
          // Mark visible insights as read
          markInsightsRead(visibleInsights.map((i) => i.id)).catch(() => {});
        }
      } catch {
        // Silently fail — nudges are non-critical
      }
    }

    load();
    return () => { cancelled = true; };
  }, [scope]);

  if (!visible || insights.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight) => {
        const Icon = TYPE_ICONS[insight.type] ?? Eye;
        const borderColor = SEVERITY_COLORS[insight.severity] ?? "border-l-border";

        return (
          <div
            key={insight.id}
            className={`border-l-4 ${borderColor} bg-card rounded-md pl-3 pr-2 py-2 flex items-start gap-2`}
          >
            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{insight.title}</span>
                <Badge variant="outline" className="text-xs">AI</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{insight.body}</span>
              {insight.relatedPage && (
                <Link
                  to={insight.relatedPage}
                  className="text-xs text-primary hover:underline ml-1"
                >
                  View
                </Link>
              )}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
              onClick={() => {
                markInsightsDismissed([insight.id]).catch(() => {});
                setInsights((prev) => prev.filter((i) => i.id !== insight.id));
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
