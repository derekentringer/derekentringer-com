import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NotificationType,
  UpdateNotificationPreferenceRequest,
  RegisterDeviceRequest,
} from "@derekentringer/shared/finance";
import {
  fetchNotificationPreferences,
  updateNotificationPreference,
  fetchNotificationHistory,
  fetchUnreadCount,
  markAllNotificationsRead,
  clearNotificationHistory,
  sendTestNotification,
  registerDevice,
} from "@/api/notifications";

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: fetchNotificationPreferences,
  });
}

export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, data }: { type: NotificationType; data: UpdateNotificationPreferenceRequest }) =>
      updateNotificationPreference(type, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    },
  });
}

export function useNotificationHistory(limit = 20) {
  return useInfiniteQuery({
    queryKey: ["notifications", "history", limit],
    queryFn: ({ pageParam = 0 }) => fetchNotificationHistory(limit, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.notifications.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unreadCount"],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useClearHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearNotificationHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: sendTestNotification,
  });
}

export function useRegisterDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RegisterDeviceRequest) => registerDevice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "devices"] });
    },
  });
}
