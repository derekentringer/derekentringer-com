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
import * as Haptics from "expo-haptics";
import useAuthStore from "@/store/authStore";
import { colors, spacing, borderRadius } from "@/theme";

interface MenuRowProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  trailing?: React.ReactNode;
}

function MenuRow({ icon, label, subtitle, onPress, disabled, destructive, trailing }: MenuRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={destructive ? colors.destructive : disabled ? colors.mutedForeground : colors.foreground}
        style={styles.rowIcon}
      />
      <View style={styles.rowContent}>
        <Text
          style={[
            styles.rowLabel,
            destructive && styles.rowLabelDestructive,
            disabled && styles.rowLabelDisabled,
          ]}
        >
          {label}
        </Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {trailing ?? (
        !disabled && (
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
        )
      )}
      {disabled && (
        <Text style={styles.comingSoon}>Coming Soon</Text>
      )}
    </Pressable>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export function MoreScreen() {
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
          disabled
        />
        <View style={styles.separator} />
        <MenuRow
          icon="bell-outline"
          label="Notifications"
          subtitle="Alerts and reminders"
          disabled
        />
        <View style={styles.separator} />
        <MenuRow
          icon="lightbulb-outline"
          label="AI Insights"
          subtitle="AI-powered financial advice"
          disabled
        />
      </MenuSection>

      <MenuSection title="Data">
        <MenuRow
          icon="chart-bar"
          label="Reports"
          subtitle="Monthly and quarterly summaries"
          disabled
        />
      </MenuSection>

      <MenuSection title="About">
        <MenuRow
          icon="information-outline"
          label="About"
          trailing={<Text style={styles.versionText}>v1.0.0</Text>}
          disabled
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
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  rowPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowIcon: {
    marginRight: 14,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  rowLabelDestructive: {
    color: colors.destructive,
  },
  rowLabelDisabled: {
    color: colors.muted,
  },
  rowSubtitle: {
    color: colors.mutedForeground,
    fontSize: 12,
  },
  comingSoon: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "500",
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 52,
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
    borderRadius: borderRadius.lg,
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
