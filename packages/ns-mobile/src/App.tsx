import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppNavigator } from "@/navigation/AppNavigator";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { AppAlertProvider } from "@/components/AppAlertProvider";
import { colors } from "@/theme";
import { useResolvedTheme } from "@/theme/colors";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    ...MaterialCommunityIcons.font,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <BottomSheetModalProvider>
              <AppAlertProvider>
                <ThemedStatusBar />
                <ErrorBoundary>
                  <AppNavigator />
                </ErrorBoundary>
              </AppAlertProvider>
            </BottomSheetModalProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Reads the app's resolved theme (user-chosen light/dark + system
 *  fallback) and tells expo-status-bar which icon-tint mode to use.
 *  `style="auto"` would only follow the OS, so a user explicitly
 *  picking Light while the OS is Dark would leave white-on-white
 *  status icons. Renders nothing visible — it just configures the
 *  native status bar. */
function ThemedStatusBar() {
  const resolved = useResolvedTheme();
  return <StatusBar style={resolved === "light" ? "dark" : "light"} />;
}
