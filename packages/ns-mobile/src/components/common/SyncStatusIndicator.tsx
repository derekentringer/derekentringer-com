import React, { useEffect, useRef } from "react";
import { Pressable, Animated, Easing, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import useSyncStore from "@/store/syncStore";
import { manualSync } from "@/lib/syncEngine";
import { useThemeColors } from "@/theme/colors";

interface Props {
  onPressIssues?: () => void;
}

export function SyncStatusIndicator({ onPressIssues }: Props) {
  const themeColors = useThemeColors();
  const status = useSyncStore((s) => s.status);
  const rejections = useSyncStore((s) => s.rejections);
  const hasRejections = rejections.length > 0;

  const spinAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (status === "syncing") {
      const anim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      animRef.current = anim;
      anim.start();
    } else {
      animRef.current?.stop();
      spinAnim.setValue(0);
    }
  }, [status, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const handlePress = () => {
    if (hasRejections && onPressIssues) {
      onPressIssues();
    } else {
      manualSync();
    }
  };

  let iconName: "cloud-check" | "cloud-sync" | "cloud-off-outline" | "cloud-alert" = "cloud-check";
  let iconColor = themeColors.muted;

  if (status === "syncing") {
    iconName = "cloud-sync";
    iconColor = themeColors.primary;
  } else if (status === "offline") {
    iconName = "cloud-off-outline";
    iconColor = themeColors.muted;
  } else if (status === "error" || hasRejections) {
    iconName = "cloud-alert";
    iconColor = themeColors.destructive;
  }

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${status}`}
    >
      {status === "syncing" ? (
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <MaterialCommunityIcons name={iconName} size={22} color={iconColor} />
        </Animated.View>
      ) : (
        <MaterialCommunityIcons name={iconName} size={22} color={iconColor} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 6,
  },
});
