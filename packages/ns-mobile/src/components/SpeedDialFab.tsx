import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface SpeedDialAction {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

interface SpeedDialFabProps {
  /** Primary action — runs when the FAB is tapped while collapsed
   *  (e.g. "New Note"). When the FAB is expanded, the primary tap
   *  collapses it instead. */
  primary: { label: string; icon: IconName; onPress: () => void };
  /** Mini-FAB actions surfaced when the speed-dial is expanded.
   *  Render order is bottom-up: first item sits closest to the
   *  primary FAB. Pass an empty array to render a plain single
   *  FAB (no expand affordance). */
  actions: SpeedDialAction[];
}

const ACTION_SPACING = 12;
const ACTION_SIZE = 44;
const PRIMARY_SIZE = 56;

export function SpeedDialFab({ primary, actions }: SpeedDialFabProps) {
  const themeColors = useThemeColors();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  // Animate to/from `open`. Spring-ish ease-out feels lively but
  // settles fast so the row is interactive after ~180ms.
  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  const close = useCallback(() => setOpen(false), []);

  const handlePrimaryPress = useCallback(() => {
    if (actions.length === 0) {
      // No mini actions — behave like a plain FAB.
      primary.onPress();
      return;
    }
    if (open) {
      close();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
  }, [actions.length, open, close, primary]);

  const handleActionPress = useCallback(
    (action: SpeedDialAction) => {
      close();
      // Defer the action one tick so the close animation has a frame
      // to start before the next screen mounts.
      requestAnimationFrame(() => action.onPress());
    },
    [close],
  );

  // The primary's runs-the-primary-action branch fires when the
  // FAB collapses to a plain `+`. We keep "tap = primary action"
  // in that case via an explicit "primary" entry in the menu, so
  // long-pressing the closed FAB always lets the user trigger the
  // primary action without expanding.
  const handlePrimaryLongPress = useCallback(() => {
    if (actions.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    primary.onPress();
  }, [actions.length, primary]);

  // Per-tile horizontal anchor: the mini-FABs are 44dp while the
  // primary is 56dp — center the smaller circle on the same vertical
  // line as the primary so the column reads as a clean stack.
  const actionRightOffset = spacing.md + (PRIMARY_SIZE - ACTION_SIZE) / 2;
  // Bottom anchor of the first mini-FAB: above the primary FAB +
  // a small gap. Subsequent rows stack ACTION_SIZE + ACTION_SPACING
  // higher each.
  const baseBottom = spacing.md + PRIMARY_SIZE + spacing.sm;

  return (
    <>
      {open ? (
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}

      {/* Mini action FABs — rendered bottom-up. Each row anchors
          directly to the screen's bottom-right so layout never
          depends on a constrained parent container. */}
      {actions.map((action, i) => {
        const bottom = baseBottom + i * (ACTION_SIZE + ACTION_SPACING);
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [PRIMARY_SIZE + i * (ACTION_SIZE + ACTION_SPACING), 0],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0, 0, 1],
        });
        const scale = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 1],
        });
        return (
          <Animated.View
            key={action.key}
            pointerEvents={open ? "auto" : "none"}
            style={[
              styles.actionRow,
              {
                bottom,
                right: actionRightOffset,
                transform: [{ translateY }, { scale }],
                opacity,
              },
            ]}
          >
            <View
              style={[
                styles.actionLabel,
                {
                  backgroundColor: themeColors.card,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text
                style={[styles.actionLabelText, { color: themeColors.foreground }]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </View>
            <Pressable
              style={[
                styles.actionButton,
                {
                  backgroundColor: themeColors.card,
                  borderColor: themeColors.border,
                },
              ]}
              onPress={() => handleActionPress(action)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <MaterialCommunityIcons
                name={action.icon}
                size={22}
                color={themeColors.primary}
              />
            </Pressable>
          </Animated.View>
        );
      })}

      {/* Primary FAB. Rotates 45° on expand so the "+" reads as an
          "×" when the menu is open — standard speed-dial cue. */}
      <Animated.View
        style={[
          styles.primaryWrap,
          {
            transform: [
              {
                rotate: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "45deg"],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          style={[styles.primary, { backgroundColor: themeColors.primary }]}
          onPress={handlePrimaryPress}
          onLongPress={handlePrimaryLongPress}
          accessibilityRole="button"
          accessibilityLabel={
            actions.length === 0
              ? primary.label
              : open
                ? "Close menu"
                : `Open ${primary.label} menu`
          }
          accessibilityState={{ expanded: open }}
        >
          <MaterialCommunityIcons
            name={primary.icon}
            size={28}
            color={themeColors.background}
          />
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // Full-screen tappable layer that closes the menu when the user
  // taps anywhere outside the FAB / mini-actions. Matches the 0.5
  // black scrim used by AppDialog and the gorhom BottomSheetBackdrop
  // throughout the app so every modal-style overlay reads as one
  // consistent "background dimmed" cue.
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  // Primary FAB anchored bottom-right with the standard 16dp margin.
  primaryWrap: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: PRIMARY_SIZE,
    height: PRIMARY_SIZE,
  },
  primary: {
    width: PRIMARY_SIZE,
    height: PRIMARY_SIZE,
    borderRadius: PRIMARY_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  // Each row anchors directly to the screen edges. The label sits
  // to the LEFT of the mini-FAB; the row's right edge is pinned to
  // the FAB's right anchor (computed inline above). The row's
  // intrinsic width grows leftward from there based on label
  // length, so longer labels never push the FAB off-screen.
  actionRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    height: ACTION_SIZE,
  },
  actionLabel: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.sm,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  actionLabelText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});
