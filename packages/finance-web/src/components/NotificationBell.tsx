import { useState, useEffect, useCallback, useRef } from "react";
import type { NotificationLogEntry } from "@derekentringer/shared/finance";
import { NOTIFICATION_LABELS } from "@derekentringer/shared/finance";
import {
  fetchUnreadCount,
  fetchNotificationHistory,
  markAllNotificationsRead,
  clearNotificationHistory,
} from "../api/notifications.ts";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const PAGE_SIZE = 20;

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadUnreadCount = useCallback(async () => {
    try {
      const { count } = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silent failure for polling
    }
  }, []);

  const loadNotifications = useCallback(async (append = false) => {
    setIsLoading(true);
    try {
      const offset = append ? notifications.length : 0;
      const { notifications: items, total: t } = await fetchNotificationHistory(
        PAGE_SIZE,
        offset,
      );
      if (append) {
        setNotifications((prev) => [...prev, ...items]);
      } else {
        setNotifications(items);
      }
      setTotal(t);
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [notifications.length]);

  // Poll unread count + listen for manual refresh events
  useEffect(() => {
    loadUnreadCount();
    pollRef.current = setInterval(loadUnreadCount, POLL_INTERVAL_MS);

    const handleRefresh = () => loadUnreadCount();
    window.addEventListener("notification-refresh", handleRefresh);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener("notification-refresh", handleRefresh);
    };
  }, [loadUnreadCount]);

  // Load notifications when popover opens
  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]); // loadNotifications is stable

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true })),
      );
    } catch {
      // Silent failure
    }
  }

  async function handleClearAll() {
    try {
      await clearNotificationHistory();
      setNotifications([]);
      setTotal(0);
      setUnreadCount(0);
    } catch {
      // Silent failure
    }
  }

  function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-error flex items-center justify-center">
              <span className="text-[9px] font-medium text-white leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            Notifications
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark Read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-error hover:text-destructive-hover"
              onClick={handleClearAll}
              disabled={notifications.length === 0}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-border last:border-0 transition-colors",
                    !n.isRead
                      ? "bg-muted/30"
                      : "opacity-70",
                  )}
                >
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {NOTIFICATION_LABELS[n.type] ?? n.type}
                      </Badge>
                      {!n.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">
                      {n.title}
                    </span>
                    <span className="text-xs text-muted-foreground line-clamp-2">
                      {n.body}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 pt-1">
                    {formatRelativeTime(n.sentAt)}
                  </span>
                </div>
              ))}

              {notifications.length < total && (
                <div className="px-4 py-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => loadNotifications(true)}
                    disabled={isLoading}
                  >
                    {isLoading ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
