import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import useAuthStore from "@/store/authStore";
import { MenuRow, MenuSection, MenuSeparator } from "@/components/common/MenuRow";
import type { MoreStackParamList } from "@/navigation/types";
import { colors, spacing } from "@/theme";

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const logout = useAuthStore((s) => s.logout);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <MenuSection title="General">
        <MenuRow
          icon="cog-outline"
          label="Settings"
          subtitle="Preferences and configuration"
          onPress={() => navigation.navigate("Settings")}
        />
        <MenuSeparator />
        <MenuRow
          icon="bell-outline"
          label="Notifications"
          subtitle="Alerts and reminders"
          onPress={() => navigation.navigate("NotificationPreferences")}
        />
        <MenuSeparator />
        <MenuRow
          icon="lightbulb-outline"
          label="AI Insights"
          subtitle="AI-powered financial advice"
          onPress={() => navigation.navigate("AiInsightsSettings")}
        />
      </MenuSection>

      <MenuSection title="Data">
        <MenuRow
          icon="chart-bar"
          label="Reports"
          subtitle="Monthly and quarterly summaries"
          onPress={() => navigation.navigate("Reports")}
        />
      </MenuSection>

      <MenuSection title="About">
        <MenuRow
          icon="information-outline"
          label="About"
          trailing={<Text style={styles.versionText}>v1.0.0</Text>}
          onPress={() => navigation.navigate("About")}
        />
      </MenuSection>

      <View style={styles.signOutSection}>
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutButtonPressed,
          ]}
          onPress={handleLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <MaterialCommunityIcons
            name="logout"
            size={20}
            color={colors.destructive}
            style={styles.signOutIcon}
          />
          <Text style={styles.signOutText}>
            {loggingOut ? "Signing Out..." : "Sign Out"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  versionText: {
    color: colors.mutedForeground,
    fontSize: 13,
  },
  signOutSection: {
    marginTop: spacing.sm,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    gap: 8,
  },
  signOutButtonPressed: {
    backgroundColor: "rgba(220,38,38,0.1)",
  },
  signOutIcon: {
    marginTop: 1,
  },
  signOutText: {
    color: colors.destructive,
    fontSize: 15,
    fontWeight: "600",
  },
});
