import type {
  RegisterDeviceRequest,
  DeviceTokenListResponse,
  NotificationPreferenceListResponse,
  UpdateNotificationPreferenceRequest,
  NotificationHistoryResponse,
  UnreadCountResponse,
  NotificationPreference,
  DeviceToken,
  NotificationLogEntry,
} from "@derekentringer/shared/finance";
import { apiFetch } from "./client.ts";

// --- Device Tokens ---

export async function registerDevice(
  data: RegisterDeviceRequest,
): Promise<{ device: DeviceToken }> {
  const res = await apiFetch("/notifications/devices", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to register device");
  }
  return res.json();
}

export async function fetchDevices(): Promise<DeviceTokenListResponse> {
  const res = await apiFetch("/notifications/devices");
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

export async function removeDevice(id: string): Promise<void> {
  const res = await apiFetch(`/notifications/devices/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to remove device");
}

// --- Notification Preferences ---

export async function fetchNotificationPreferences(): Promise<NotificationPreferenceListResponse> {
  const res = await apiFetch("/notifications/preferences");
  if (!res.ok) throw new Error("Failed to fetch notification preferences");
  return res.json();
}

export async function updateNotificationPreference(
  type: string,
  data: UpdateNotificationPreferenceRequest,
): Promise<{ preference: NotificationPreference }> {
  const res = await apiFetch(`/notifications/preferences/${type}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to update notification preference");
  }
  return res.json();
}

// --- Notification History ---

export async function fetchNotificationHistory(
  limit = 20,
  offset = 0,
): Promise<NotificationHistoryResponse> {
  const res = await apiFetch(
    `/notifications/history?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) throw new Error("Failed to fetch notification history");
  return res.json();
}

export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  const res = await apiFetch("/notifications/unread-count");
  if (!res.ok) throw new Error("Failed to fetch unread count");
  return res.json();
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const res = await apiFetch("/notifications/mark-all-read", {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to mark notifications as read");
  return res.json();
}

export async function clearNotificationHistory(): Promise<{ cleared: number }> {
  const res = await apiFetch("/notifications/history", {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to clear notification history");
  return res.json();
}

export async function sendTestNotification(): Promise<{
  success: boolean;
  notification: NotificationLogEntry | null;
  fcm: { sent: boolean; messageId: string | null; error: string | null } | null;
}> {
  const res = await apiFetch("/notifications/test", {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to send test notification");
  return res.json();
}
