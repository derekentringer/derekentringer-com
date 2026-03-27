import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "@/navigation/types";
import useAuthStore from "@/store/authStore";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";
import { useTrashCount } from "@/hooks/useTrash";

type Props = NativeStackScreenProps<SettingsStackParamList, "SettingsHome">;

export function SettingsScreen({ navigation }: Props) {
  const themeColors = useThemeColors();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data: trashCount } = useTrashCount();

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch {
            // Still logged out locally even if API call fails
          }
        },
      },
    ]);
  };

  const styles = makeStyles(themeColors);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email ?? "—"}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <Pressable
          style={styles.menuRow}
          onPress={() => navigation.navigate("Trash")}
          accessibilityRole="button"
          accessibilityLabel="Open trash"
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={20}
            color={themeColors.foreground}
          />
          <Text style={styles.menuRowText}>Trash</Text>
          <View style={styles.menuRowRight}>
            {trashCount != null && trashCount > 0 ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: themeColors.destructive },
                ]}
              >
                <Text style={styles.badgeText}>{trashCount}</Text>
              </View>
            ) : null}
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={themeColors.muted}
            />
          </View>
        </Pressable>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(themeColors: ReturnType<typeof import("@/theme/colors").useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
      padding: spacing.md,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      color: themeColors.muted,
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    card: {
      backgroundColor: themeColors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    label: {
      color: themeColors.muted,
      fontSize: 12,
      marginBottom: spacing.xs,
    },
    value: {
      color: themeColors.foreground,
      fontSize: 16,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: themeColors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: themeColors.border,
      gap: spacing.sm,
    },
    menuRowText: {
      color: themeColors.foreground,
      fontSize: 16,
      flex: 1,
    },
    menuRowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    badge: {
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    badgeText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "700",
    },
    logoutButton: {
      backgroundColor: themeColors.destructive,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm + 4,
      alignItems: "center",
      marginTop: spacing.lg,
    },
    logoutText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
