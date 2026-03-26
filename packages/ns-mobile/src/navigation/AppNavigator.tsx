import React, { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import useAuthStore from "@/store/authStore";
import { LoginScreen } from "@/screens/LoginScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { NoteDetailScreen } from "@/screens/NoteDetailScreen";
import { NotesScreen } from "@/screens/NotesScreen";
import { SearchScreen } from "@/screens/SearchScreen";
import { AiScreen } from "@/screens/AiScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { useThemeColors } from "@/theme/colors";
import { colors } from "@/theme";
import type { DashboardStackParamList } from "./types";

const AuthStack = createNativeStackNavigator();
const MainTab = createBottomTabNavigator();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();

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
    </DashboardStack.Navigator>
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
        name="Search"
        component={SearchScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.foreground,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="magnify" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="AI"
        component={AiScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.foreground,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="robot" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.foreground,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" color={color} size={size} />
          ),
        }}
      />
    </MainTab.Navigator>
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
      {isAuthenticated ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
