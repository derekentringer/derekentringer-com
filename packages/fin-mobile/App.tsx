import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { AppNavigator } from "@/navigation/AppNavigator";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import useAuthStore from "@/store/authStore";
import { registerForPushNotifications } from "@/services/pushNotifications";
import { colors } from "@/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
    },
  },
});

function PushNotificationSetup() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotifications().catch(console.warn);

    // Handle notification taps
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // Navigation handled by deep linking if needed
      },
    );

    return () => subscription.remove();
  }, [isAuthenticated]);

  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <OfflineBanner />
            <PushNotificationSetup />
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
