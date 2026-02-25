import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { AiInsight, AiInsightScope } from "@derekentringer/shared/finance";
import { fetchAiPreferences, fetchAiInsights } from "../api/ai.ts";
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
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
        setInsights(data.insights.slice(0, 2));
        setVisible(true);
      } catch {
        // Silently fail — nudges are non-critical
      }
    }

    load();
    return () => { cancelled = true; };
  }, [scope]);

  const visibleInsights = insights.filter((i) => !dismissed.has(i.id));
  if (!visible || visibleInsights.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visibleInsights.map((insight) => {
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
              onClick={() => setDismissed((prev) => new Set(prev).add(insight.id))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
