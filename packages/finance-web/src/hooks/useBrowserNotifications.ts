import { useEffect, useRef } from "react";
import {
  fetchNotificationHistory,
  fetchUnreadCount,
} from "../api/notifications.ts";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Polls for new notifications and shows browser Notification popups
 * for new unread items. Tracks shown IDs to prevent duplicates.
 * Like VoidForge's use-browser-notifications pattern.
 */
export function useBrowserNotifications() {
  const shownIds = useRef(new Set<string>());
  const isFirstCheck = useRef(true);

  useEffect(() => {
    async function check() {
      try {
        const [{ notifications }, { count: unreadCount }] = await Promise.all([
          fetchNotificationHistory(20, 0),
          fetchUnreadCount(),
        ]);

        if (Notification.permission === "granted") {
          const newUnread = notifications.filter((n) => {
            if (n.isRead) return false;
            if (shownIds.current.has(n.id)) return false;
            // Skip on first load — only notify for truly new items
            if (isFirstCheck.current) return false;
            return true;
          });

          for (const n of newUnread) {
            new Notification(n.title, {
              body: n.body,
              tag: `notification-${n.id}`,
            });
            shownIds.current.add(n.id);
          }
        }

        // Seed shown set on first load to prevent duplicate popups
        if (isFirstCheck.current) {
          for (const n of notifications) {
            if (!n.isRead) shownIds.current.add(n.id);
          }
          isFirstCheck.current = false;
        }

        // Refresh bell badge with unread count
        window.dispatchEvent(
          new CustomEvent("notification-refresh", {
            detail: { unreadCount },
          }),
        );
      } catch {
        // Silent failure for polling
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
