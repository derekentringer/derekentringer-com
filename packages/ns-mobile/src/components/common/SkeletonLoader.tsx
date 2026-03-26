import React, { useEffect } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useThemeColors } from "@/theme/colors";
import { borderRadius } from "@/theme";

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadiusSize?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({
  width = "100%",
  height = 16,
  borderRadiusSize = borderRadius.sm,
  style,
}: SkeletonLoaderProps) {
  const themeColors = useThemeColors();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: themeColors.border },
        { width: width as number, height, borderRadius: borderRadiusSize },
        animatedStyle,
        style,
      ]}
    />
  );
}

interface SkeletonCardProps {
  lines?: number;
  style?: ViewStyle;
}

export function SkeletonCard({ lines = 2, style }: SkeletonCardProps) {
  const themeColors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
        style,
      ]}
    >
      <SkeletonLoader width={96} height={12} />
      <View style={styles.gap} />
      {Array.from({ length: lines }).map((_, i) => (
        <React.Fragment key={i}>
          <SkeletonLoader
            width={i === 0 ? 128 : "80%"}
            height={i === 0 ? 28 : 16}
          />
          {i < lines - 1 && <View style={styles.smallGap} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 16,
  },
  gap: {
    height: 12,
  },
  smallGap: {
    height: 8,
  },
});
