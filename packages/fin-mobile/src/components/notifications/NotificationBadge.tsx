import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation } from "@react-navigation/native";
import { useUnreadCount } from "@/hooks/useNotifications";
import { colors, spacing } from "@/theme";

export function NotificationBadge() {
  const navigation = useNavigation<any>();
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;

  return (
    <Pressable
      style={styles.container}
      onPress={() =>
        navigation.navigate("More", { screen: "NotificationHistory" })
      }
      accessibilityRole="button"
      accessibilityLabel={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
    >
      <MaterialCommunityIcons
        name="bell-outline"
        size={22}
        color={colors.foreground}
      />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {count > 9 ? "9+" : String(count)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
    padding: 4,
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: colors.destructive,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
  },
});
