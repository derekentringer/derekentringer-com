import { useState, useEffect, useCallback } from "react";
import type { AiInsightPreferences, AiRefreshFrequency, AiInsightStatusEntry } from "@derekentringer/shared/finance";
import { DEFAULT_AI_INSIGHT_PREFERENCES } from "@derekentringer/shared/finance";
import { fetchAiPreferences, updateAiPreferences, clearAiCache, fetchInsightArchive } from "../api/ai.ts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Trash2, Eye, Lightbulb, AlertTriangle, PartyPopper } from "lucide-react";

const FREQUENCY_OPTIONS: { value: AiRefreshFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
  { value: "on_data_change", label: "On data change" },
];

const FEATURE_TOGGLES: { key: keyof AiInsightPreferences; label: string; description: string }[] = [
  { key: "dashboardCard", label: "Dashboard card", description: "AI insights card on the main dashboard" },
  { key: "monthlyDigest", label: "Monthly digest", description: "AI-generated monthly financial summary in Reports" },
  { key: "quarterlyDigest", label: "Quarterly digest", description: "AI-generated quarterly financial review in Reports" },
  { key: "pageNudges", label: "Page-level insights", description: "Contextual AI insights on Budget, Goals, and other pages" },
  { key: "smartAlerts", label: "AI-powered alerts", description: "AI anomaly detection through the notification system" },
];

const TYPE_ICONS: Record<string, typeof Eye> = {
  observation: Eye,
  recommendation: Lightbulb,
  alert: AlertTriangle,
  celebration: PartyPopper,
};

const SEVERITY_BORDER: Record<string, string> = {
  info: "border-l-blue-400",
  warning: "border-l-yellow-400",
  success: "border-l-green-400",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(insights: AiInsightStatusEntry[]): { date: string; items: AiInsightStatusEntry[] }[] {
  const groups = new Map<string, AiInsightStatusEntry[]>();
  for (const insight of insights) {
    const date = formatDate(insight.generatedAt);
    const existing = groups.get(date);
    if (existing) {
      existing.push(insight);
    } else {
      groups.set(date, [insight]);
    }
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

export function AiInsightSettings() {
  const [prefs, setPrefs] = useState<AiInsightPreferences>(DEFAULT_AI_INSIGHT_PREFERENCES);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isClearing, setIsClearing] = useState(false);

  // Archive state
  const [archive, setArchive] = useState<AiInsightStatusEntry[]>([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveOffset, setArchiveOffset] = useState(0);
  const ARCHIVE_PAGE_SIZE = 20;

  const loadPrefs = useCallback(async () => {
    try {
      const data = await fetchAiPreferences();
      setPrefs(data.preferences);
      setDailyUsed(data.dailyRequestsUsed);
      setDailyLimit(data.dailyRequestsLimit);
      setError("");
    } catch {
      setError("Failed to load AI preferences");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadArchive = useCallback(async (offset: number, append: boolean) => {
    setArchiveLoading(true);
    try {
      const data = await fetchInsightArchive(ARCHIVE_PAGE_SIZE, offset);
      setArchive((prev) => append ? [...prev, ...data.insights] : data.insights);
      setArchiveTotal(data.total);
      setArchiveOffset(offset + data.insights.length);
    } catch {
      // Non-critical
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrefs();
    loadArchive(0, false);
  }, [loadPrefs, loadArchive]);

  async function handleToggle(key: keyof AiInsightPreferences, value: boolean) {
    try {
      const data = await updateAiPreferences({ [key]: value });
      setPrefs(data.preferences);
      setDailyUsed(data.dailyRequestsUsed);
      setError("");
    } catch {
      setError("Failed to update preference");
    }
  }

  async function handleFrequencyChange(value: AiRefreshFrequency) {
    try {
      const data = await updateAiPreferences({ refreshFrequency: value });
      setPrefs(data.preferences);
      setError("");
    } catch {
      setError("Failed to update refresh frequency");
    }
  }

  async function handleClearCache() {
    setIsClearing(true);
    setError("");
    try {
      await clearAiCache();
    } catch {
      setError("Failed to clear cache");
    } finally {
      setIsClearing(false);
    }
  }

  if (isLoading) {
    return <p className="text-center text-muted py-8">Loading...</p>;
  }

  const archiveGroups = groupByDate(archive);

  return (
    <div className="flex flex-col gap-6">
      {/* Master Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl text-foreground">AI Insights</h2>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-error mb-4">{error}</p>}

          <div className="flex items-center justify-between py-2 px-3 rounded-md border border-border mb-4">
            <div className="flex flex-col gap-0.5 min-w-0 mr-3">
              <span className="text-sm font-medium text-foreground">Enable AI Insights</span>
              <span className="text-xs text-muted-foreground">
                When enabled, your financial data (category-level summaries, balances, goal progress) is sent to the
                Anthropic API to generate personalized insights. No raw transaction descriptions are shared.
              </span>
            </div>
            <Switch
              checked={prefs.masterEnabled}
              onCheckedChange={(checked) => handleToggle("masterEnabled", checked)}
            />
          </div>

          {/* Per-feature toggles */}
          <div className="flex flex-col gap-2">
            {FEATURE_TOGGLES.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex items-center justify-between py-2 px-3 rounded-md border border-border"
              >
                <div className="flex flex-col gap-0.5 min-w-0 mr-3">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </div>
                <Switch
                  checked={prefs[key] as boolean}
                  onCheckedChange={(checked) => handleToggle(key, checked)}
                  disabled={!prefs.masterEnabled}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Refresh Frequency + Usage */}
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Refresh Frequency</h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {FREQUENCY_OPTIONS.map(({ value, label }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={prefs.refreshFrequency === value ? "default" : "secondary"}
                  onClick={() => handleFrequencyChange(value)}
                  disabled={!prefs.masterEnabled}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Daily API usage:</span>
              <Badge variant={dailyUsed >= dailyLimit ? "destructive" : "muted"}>
                {dailyUsed} / {dailyLimit}
              </Badge>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="w-fit mt-2"
              onClick={handleClearCache}
              disabled={isClearing || !prefs.masterEnabled}
            >
              <Trash2 className="h-4 w-4" />
              {isClearing ? "Clearing..." : "Clear insight cache"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Insight History */}
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Insight History</h2>
        </CardHeader>
        <CardContent>
          {archive.length === 0 && !archiveLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">No insight history yet</p>
          ) : (
            <div className="flex flex-col gap-4">
              {archiveGroups.map((group) => (
                <div key={group.date}>
                  <div className="text-xs font-medium text-muted-foreground mb-2">{group.date}</div>
                  <div className="flex flex-col gap-2">
                    {group.items.map((insight) => {
                      const Icon = TYPE_ICONS[insight.type] ?? Eye;
                      const borderColor = SEVERITY_BORDER[insight.severity] ?? "border-l-border";
                      const isMuted = insight.isRead || insight.isDismissed;

                      return (
                        <div
                          key={insight.insightId}
                          className={`border-l-4 ${borderColor} pl-3 py-2 ${isMuted ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{insight.title}</span>
                                <Badge variant="outline" className="text-xs">{insight.scope}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{insight.body}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {archive.length < archiveTotal && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-fit mx-auto"
                  onClick={() => loadArchive(archiveOffset, true)}
                  disabled={archiveLoading}
                >
                  {archiveLoading ? "Loading..." : "Load More"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
