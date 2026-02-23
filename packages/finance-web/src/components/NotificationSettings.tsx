import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import type {
  DeviceToken,
  NotificationPreference,
  NotificationConfig,
  BillDueConfig,
  CreditPaymentDueConfig,
  LoanPaymentDueConfig,
  HighCreditUtilizationConfig,
  BudgetOverspendConfig,
  LargeTransactionConfig,
  StatementReminderConfig,
  MilestonesConfig,
} from "@derekentringer/shared/finance";
import {
  NotificationType,
  NOTIFICATION_LABELS,
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PHASES,
} from "@derekentringer/shared/finance";
import {
  fetchDevices,
  removeDevice,
  fetchNotificationPreferences,
  updateNotificationPreference,
  sendTestNotification,
} from "../api/notifications.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Bell, Trash2, Send, Settings2 } from "lucide-react";

export function NotificationSettings() {
  return (
    <div className="flex flex-col gap-6">
      <BrowserNotificationsCard />
      <NotificationPreferencesCard />
    </div>
  );
}

function BrowserNotificationsCard() {
  const [permission, setPermission] = useState(Notification.permission);
  const [devices, setDevices] = useState<DeviceToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      const { devices } = await fetchDevices();
      setDevices(devices);
      setError("");
    } catch {
      setError("Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  async function handleEnableBrowserNotifications() {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      setError("Failed to request notification permission");
    }
  }

  async function handleRemoveDevice(id: string) {
    try {
      await removeDevice(id);
      await loadDevices();
    } catch {
      setError("Failed to remove device");
    }
  }

  async function handleSendTest() {
    setIsTesting(true);
    setError("");
    try {
      await sendTestNotification();
      // Polling hook will pick up the new notification and show a browser popup
      window.dispatchEvent(new Event("notification-refresh"));
    } catch {
      setError("Failed to send test notification");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl text-foreground">Browser Notifications</h2>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSendTest}
              disabled={isTesting || permission !== "granted"}
              title={permission !== "granted" ? "Enable browser notifications first" : undefined}
            >
              <Send className="h-4 w-4" />
              {isTesting ? "Sending..." : "Send Test"}
            </Button>
            {permission !== "granted" && (
              <Button
                size="sm"
                onClick={handleEnableBrowserNotifications}
                disabled={permission === "denied"}
                title={permission === "denied" ? "Notifications blocked — update in browser settings" : undefined}
              >
                <Bell className="h-4 w-4" />
                Enable Notifications
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-error mb-4">{error}</p>}

        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Permission:</span>
          <Badge variant={permission === "granted" ? "default" : permission === "denied" ? "destructive" : "muted"}>
            {permission === "granted" ? "Enabled" : permission === "denied" ? "Blocked" : "Not set"}
          </Badge>
        </div>

        {permission === "granted" && (
          <p className="text-sm text-muted-foreground mb-4">
            Browser notifications are active. New alerts will appear as desktop popups.
          </p>
        )}
        {permission === "denied" && (
          <p className="text-sm text-muted-foreground mb-4">
            Notifications are blocked. Update your browser settings to allow notifications for this site.
          </p>
        )}
        {permission === "default" && (
          <p className="text-sm text-muted-foreground mb-4">
            Click "Enable Notifications" to allow desktop notification popups for new alerts.
          </p>
        )}

        {/* Mobile device tokens (for future React Native app) */}
        {isLoading ? null : devices.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-4">
              Mobile Devices
            </h3>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Device</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="hidden sm:table-cell">Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>{device.name || "Unknown device"}</TableCell>
                    <TableCell>
                      <Badge variant="muted">{device.platform}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {new Date(device.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-error hover:text-destructive-hover"
                        onClick={() => handleRemoveDevice(device.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  reminders: "Reminders",
  alerts: "Alerts",
  milestones: "Milestones",
};

const CATEGORY_ORDER = ["reminders", "alerts", "milestones"];

function NotificationPreferencesCard() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [configTarget, setConfigTarget] = useState<NotificationPreference | null>(null);

  const loadPreferences = useCallback(async () => {
    try {
      const { preferences } = await fetchNotificationPreferences();
      setPreferences(preferences);
      setError("");
    } catch {
      setError("Failed to load notification preferences");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  async function handleToggle(type: string, enabled: boolean) {
    try {
      await updateNotificationPreference(type, { enabled });
      setPreferences((prev) =>
        prev.map((p) => (p.type === type ? { ...p, enabled } : p)),
      );
    } catch {
      setError("Failed to update preference");
    }
  }

  // Group preferences by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: preferences
      .filter((p) => NOTIFICATION_CATEGORIES[p.type] === cat)
      .sort(
        (a, b) =>
          Object.values(NotificationType).indexOf(a.type) -
          Object.values(NotificationType).indexOf(b.type),
      ),
  })).filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl text-foreground">Notification Preferences</h2>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-error mb-4">{error}</p>}

        {isLoading ? (
          <p className="text-center text-muted py-8">Loading...</p>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(({ category, label, items }) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  {label}
                </h3>
                <div className="flex flex-col gap-2">
                  {items.map((pref) => {
                    const phase = NOTIFICATION_PHASES[pref.type];
                    const isPhase1 = phase === 1;

                    return (
                      <div
                        key={pref.id}
                        className="flex items-center justify-between py-2 px-3 rounded-md border border-border"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 mr-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {NOTIFICATION_LABELS[pref.type]}
                            </span>
                            {!isPhase1 && (
                              <Badge variant="outline" className="text-xs">
                                Coming soon
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {NOTIFICATION_DESCRIPTIONS[pref.type]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isPhase1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setConfigTarget(pref)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Switch
                            checked={pref.enabled}
                            onCheckedChange={(checked) =>
                              handleToggle(pref.type, checked)
                            }
                            disabled={!isPhase1}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {configTarget && (
        <ConfigDialog
          preference={configTarget}
          onClose={() => setConfigTarget(null)}
          onSaved={(updated) => {
            setPreferences((prev) =>
              prev.map((p) => (p.type === updated.type ? updated : p)),
            );
            setConfigTarget(null);
          }}
        />
      )}
    </Card>
  );
}

function ConfigDialog({
  preference,
  onClose,
  onSaved,
}: {
  preference: NotificationPreference;
  onClose: () => void;
  onSaved: (pref: NotificationPreference) => void;
}) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const config = preference.config;

  // State for different config types
  const [reminderDays, setReminderDays] = useState(
    (config as BillDueConfig | CreditPaymentDueConfig | LoanPaymentDueConfig)
      ?.reminderDaysBefore ?? 3,
  );
  const [thresholds, setThresholds] = useState(
    (config as HighCreditUtilizationConfig)?.thresholds?.join(", ") ?? "30, 70",
  );
  const [warnAt, setWarnAt] = useState(
    (config as BudgetOverspendConfig)?.warnAtPercent ?? 80,
  );
  const [alertAt, setAlertAt] = useState(
    (config as BudgetOverspendConfig)?.alertAtPercent ?? 100,
  );
  const [txnThreshold, setTxnThreshold] = useState(
    (config as LargeTransactionConfig)?.threshold ?? 500,
  );
  const [fallbackDay, setFallbackDay] = useState(
    (config as StatementReminderConfig)?.fallbackDayOfMonth ?? 28,
  );
  const [netWorthMilestones, setNetWorthMilestones] = useState(
    (config as MilestonesConfig)?.netWorthMilestones?.join(", ") ??
      "50000, 100000, 250000, 500000, 1000000",
  );
  const [payoffMilestones, setPayoffMilestones] = useState(
    (config as MilestonesConfig)?.loanPayoffPercentMilestones?.join(", ") ??
      "25, 50, 75, 90, 100",
  );

  function buildConfig(): NotificationConfig {
    switch (preference.type) {
      case NotificationType.BillDue:
        return { reminderDaysBefore: reminderDays } as BillDueConfig;
      case NotificationType.CreditPaymentDue:
        return { reminderDaysBefore: reminderDays } as CreditPaymentDueConfig;
      case NotificationType.LoanPaymentDue:
        return { reminderDaysBefore: reminderDays } as LoanPaymentDueConfig;
      case NotificationType.HighCreditUtilization:
        return {
          thresholds: thresholds
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n)),
        } as HighCreditUtilizationConfig;
      case NotificationType.BudgetOverspend:
        return {
          warnAtPercent: warnAt,
          alertAtPercent: alertAt,
        } as BudgetOverspendConfig;
      case NotificationType.LargeTransaction:
        return { threshold: txnThreshold } as LargeTransactionConfig;
      case NotificationType.StatementReminder:
        return {
          reminderDaysBefore: reminderDays,
          fallbackDayOfMonth: fallbackDay,
        } as StatementReminderConfig;
      case NotificationType.Milestones:
        return {
          netWorthMilestones: netWorthMilestones
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n)),
          loanPayoffPercentMilestones: payoffMilestones
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n)),
        } as MilestonesConfig;
      default:
        return { reminderDaysBefore: reminderDays } as BillDueConfig;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const newConfig = buildConfig();
      const { preference: updated } = await updateNotificationPreference(
        preference.type,
        { config: newConfig },
      );
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderFields() {
    switch (preference.type) {
      case NotificationType.BillDue:
      case NotificationType.CreditPaymentDue:
      case NotificationType.LoanPaymentDue:
        return (
          <div className="flex flex-col gap-1">
            <Label>Remind me ___ days before</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={reminderDays}
              onChange={(e) => setReminderDays(Number(e.target.value))}
            />
          </div>
        );
      case NotificationType.HighCreditUtilization:
        return (
          <div className="flex flex-col gap-1">
            <Label>Utilization thresholds (%)</Label>
            <Input
              value={thresholds}
              onChange={(e) => setThresholds(e.target.value)}
              placeholder="30, 70"
            />
            <span className="text-xs text-muted-foreground">
              Comma-separated percentages
            </span>
          </div>
        );
      case NotificationType.BudgetOverspend:
        return (
          <>
            <div className="flex flex-col gap-1">
              <Label>Warn at (%)</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={warnAt}
                onChange={(e) => setWarnAt(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Alert at (%)</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={alertAt}
                onChange={(e) => setAlertAt(Number(e.target.value))}
              />
            </div>
          </>
        );
      case NotificationType.LargeTransaction:
        return (
          <div className="flex flex-col gap-1">
            <Label>Alert for transactions over ($)</Label>
            <Input
              type="number"
              min={1}
              value={txnThreshold}
              onChange={(e) => setTxnThreshold(Number(e.target.value))}
            />
          </div>
        );
      case NotificationType.StatementReminder:
        return (
          <>
            <div className="flex flex-col gap-1">
              <Label>Remind me ___ days before</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Fallback day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={fallbackDay}
                onChange={(e) => setFallbackDay(Number(e.target.value))}
              />
            </div>
          </>
        );
      case NotificationType.Milestones:
        return (
          <>
            <div className="flex flex-col gap-1">
              <Label>Net worth milestones ($)</Label>
              <Input
                value={netWorthMilestones}
                onChange={(e) => setNetWorthMilestones(e.target.value)}
                placeholder="50000, 100000, 250000"
              />
              <span className="text-xs text-muted-foreground">
                Comma-separated dollar amounts
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Loan payoff milestones (%)</Label>
              <Input
                value={payoffMilestones}
                onChange={(e) => setPayoffMilestones(e.target.value)}
                placeholder="25, 50, 75, 90, 100"
              />
              <span className="text-xs text-muted-foreground">
                Comma-separated percentages
              </span>
            </div>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Configure {NOTIFICATION_LABELS[preference.type]}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          {renderFields()}
          {error && <p className="text-sm text-error text-center">{error}</p>}
          <div className="flex gap-3 justify-end mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
