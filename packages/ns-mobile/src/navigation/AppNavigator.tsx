import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import useAuthStore from "@/store/authStore";
import useSyncStore from "@/store/syncStore";
import useAiSettingsStore from "@/store/aiSettingsStore";
import { LoginScreen } from "@/screens/LoginScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { NoteDetailScreen } from "@/screens/NoteDetailScreen";
import { NoteEditorScreen } from "@/screens/NoteEditorScreen";
import { NotesScreen } from "@/screens/NotesScreen";
import { AiScreen } from "@/screens/AiScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { TrashScreen } from "@/screens/TrashScreen";
import { TrashNoteDetailScreen } from "@/screens/TrashNoteDetailScreen";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { useThemeColors } from "@/theme/colors";
import { colors } from "@/theme";
import { initDatabase } from "@/lib/database";
import { initSyncEngine, destroySyncEngine } from "@/lib/syncEngine";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { tokenStorage } from "@/services/api";
import type { AiStackParamList, DashboardStackParamList, SettingsStackParamList } from "./types";

const API_BASE_URL = __DEV__
  ? "http://localhost:3004"
  : "https://ns-api.derekentringer.com";

const AuthStack = createNativeStackNavigator();
const MainTab = createBottomTabNavigator();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const AiStack = createNativeStackNavigator<AiStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

function DashboardNavigator() {
  const themeColors = useThemeColors();

  return (
    <DashboardStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: themeColors.background },
        headerTintColor: themeColors.foreground,
        headerShadowVisible: false,
      }}
    >
      <DashboardStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ title: "Dashboard" }}
      />
      <DashboardStack.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ title: "" }}
      />
      <DashboardStack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={{ title: "Editor" }}
      />
    </DashboardStack.Navigator>
  );
}

function AiNavigator() {
  const themeColors = useThemeColors();

  return (
    <AiStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: themeColors.background },
        headerTintColor: themeColors.foreground,
        headerShadowVisible: false,
      }}
    >
      <AiStack.Screen
        name="AiHome"
        component={AiScreen}
        options={{ title: "AI Assistant" }}
      />
      <AiStack.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ title: "" }}
      />
      <AiStack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={{ title: "Editor" }}
      />
    </AiStack.Navigator>
  );
}

function SettingsNavigator() {
  const themeColors = useThemeColors();

  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: themeColors.background },
        headerTintColor: themeColors.foreground,
        headerShadowVisible: false,
      }}
    >
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
      <SettingsStack.Screen
        name="Trash"
        component={TrashScreen}
        options={{ title: "Trash" }}
      />
      <SettingsStack.Screen
        name="TrashNoteDetail"
        component={TrashNoteDetailScreen}
        options={{ title: "" }}
      />
    </SettingsStack.Navigator>
  );
}

function MainTabNavigator() {
  const themeColors = useThemeColors();

  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: themeColors.background, borderTopColor: themeColors.border },
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.tabInactive,
      }}
    >
      <MainTab.Screen
        name="Dashboard"
        component={DashboardNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="Notes"
        component={NotesScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="note-text" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="AI"
        component={AiNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="robot" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" color={color} size={size} />
          ),
        }}
      />
    </MainTab.Navigator>
  );
}

function AuthenticatedApp() {
  const queryClient = useQueryClient();
  const syncSetStatus = useSyncStore((s) => s.setStatus);
  const syncSetRejections = useSyncStore((s) => s.setRejections);
  const isOnline = useSyncStore((s) => s.isOnline);
  const insets = useSafeAreaInsets();
  const syncInitialized = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useNetworkStatus();

  useEffect(() => {
    if (syncInitialized.current) return;
    syncInitialized.current = true;

    (async () => {
      // Hydrate the AI settings store from AsyncStorage so the
      // AiScreen reads the user's persisted auto-approve flags
      // before its first askQuestion call.
      void useAiSettingsStore.getState().hydrate();
      // Initialize local database first — must complete before any queries fire
      await initDatabase();
      // Phase A.0: normalize any drifted folder isLocalFile flag to match its
      // root ancestor. Gated on sync_meta so this is a one-time sweep.
      const { normalizeFolderIsLocalFileCascade } = await import("@/lib/noteStore");
      await normalizeFolderIsLocalFileCascade().catch(() => {
        // Non-fatal: the invariant is also enforced server-side + on sync apply.
      });
      setIsReady(true);

      // Initialize sync engine
      await initSyncEngine(
        API_BASE_URL,
        () => tokenStorage.getAccessToken(),
        {
          onStatusChange: (status, error) => {
            syncSetStatus(status, error);
          },
          onDataChanged: () => {
            // Invalidate all queries so React Query refetches from SQLite
            queryClient.invalidateQueries();
          },
          onSyncRejections: (rejections, forcePush, discard) => {
            syncSetRejections(rejections, forcePush, discard);
          },
          onChatChanged: () => {
            // Phase A.5.1: another device wrote to the user's chat
            // history; nudge AiScreen to re-run fetchChatHistory.
            useSyncStore.getState().bumpChatRefresh();
          },
        },
      );
    })();

    return () => {
      destroySyncEngine();
      syncInitialized.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <OfflineBanner />
      <View style={{ flex: 1, marginTop: isOnline ? 0 : -insets.top }}>
        <MainTabNavigator />
      </View>
    </View>
  );
}

export function AppNavigator() {
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AuthenticatedApp /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
