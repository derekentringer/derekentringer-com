import type { ReactNode } from "react";
import type { ViewStyle, StyleProp } from "react-native";
import Animated, { withSpring, type EntryAnimationsValues, type EntryExitAnimationFunction } from "react-native-reanimated";

// iMessage-style bubble entry. Same spec across mobile/desktop/web:
//   scale 0.5 → 1, opacity 0 → 1, translateY 8 → 0
//   spring stiffness 260, damping 22, mass 1 (≈ Apple's
//     spring(response: 0.35, dampingFraction: 0.75))
//   transform-origin: bottom-right for outgoing (user), bottom-left
//     for incoming (assistant / system). RN 0.74+ honors the
//     `transformOrigin` style.
const SPRING = { damping: 22, stiffness: 260, mass: 1 } as const;

const enteringAnimation: EntryExitAnimationFunction = (_values: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: 0.5 }, { translateY: 8 }],
    },
    animations: {
      opacity: withSpring(1, SPRING),
      transform: [
        { scale: withSpring(1, SPRING) },
        { translateY: withSpring(0, SPRING) },
      ],
    },
  };
};

export function ChatBubbleEnter({
  align,
  style,
  children,
}: {
  align: "left" | "right";
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      entering={enteringAnimation}
      style={[
        style,
        { transformOrigin: align === "right" ? "bottom right" : "bottom left" },
      ]}
    >
      {children}
    </Animated.View>
  );
}
