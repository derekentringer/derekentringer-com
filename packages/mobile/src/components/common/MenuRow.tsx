import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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

export function MenuRow({ icon, label, subtitle, onPress, disabled, destructive, trailing }: MenuRowProps) {
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

export function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export function MenuSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
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
    paddingVertical: spacing.md,
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
});
