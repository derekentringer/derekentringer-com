import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { registerDevice, removeDevice } from "@/api/notifications";

// Configure foreground notification display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  // Android notification channel — must match backend's channelId in fcm.ts
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("finance_notifications", {
      name: "Finance Notifications",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
    });
  }

  // Get native FCM device token (not Expo push token)
  const tokenData = await Notifications.getDevicePushTokenAsync();
  const token = tokenData.data as string;

  // Register with backend
  await registerDevice({
    token,
    platform: Platform.OS as "ios" | "android",
    name: Device.modelName ?? undefined,
  });

  return token;
}

export async function unregisterPushNotifications(deviceId: string): Promise<void> {
  await removeDevice(deviceId);
}
