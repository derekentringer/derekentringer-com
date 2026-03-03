import type {
  DeviceTokenListResponse,
  RegisterDeviceRequest,
  NotificationPreferenceListResponse,
  UpdateNotificationPreferenceRequest,
  NotificationHistoryResponse,
  UnreadCountResponse,
  NotificationType,
} from "@derekentringer/shared/finance";
import api from "@/services/api";

export async function registerDevice(
  body: RegisterDeviceRequest,
): Promise<void> {
  await api.post("/notifications/devices", body);
}

export async function fetchDevices(): Promise<DeviceTokenListResponse> {
  const { data } = await api.get<DeviceTokenListResponse>("/notifications/devices");
  return data;
}

export async function removeDevice(id: string): Promise<void> {
  await api.delete(`/notifications/devices/${id}`);
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferenceListResponse> {
  const { data } = await api.get<NotificationPreferenceListResponse>("/notifications/preferences");
  return data;
}

export async function updateNotificationPreference(
  type: NotificationType,
  body: UpdateNotificationPreferenceRequest,
): Promise<void> {
  await api.patch(`/notifications/preferences/${type}`, body);
}

export async function fetchNotificationHistory(
  limit?: number,
  offset?: number,
): Promise<NotificationHistoryResponse> {
  const params: Record<string, string> = {};
  if (limit !== undefined) params.limit = String(limit);
  if (offset !== undefined) params.offset = String(offset);
  const { data } = await api.get<NotificationHistoryResponse>("/notifications/history", { params });
  return data;
}

export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  const { data } = await api.get<UnreadCountResponse>("/notifications/unread-count");
  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/mark-all-read");
}

export async function clearNotificationHistory(): Promise<void> {
  await api.delete("/notifications/history");
}

export async function sendTestNotification(): Promise<void> {
  await api.post("/notifications/test");
}
