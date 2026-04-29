import { Easing, LinearTransition } from "react-native-reanimated";

// Mirrors the `transition-[max-height,opacity] duration-300
// ease-in-out` pattern used across ns-web and ns-desktop for
// sidebar / panel expand-collapse. Reanimated's
// `LinearTransition` auto-animates layout changes (height,
// width, position) on any `Animated.View` that has it set as
// the `layout` prop.
//
// We pre-build the transition once at module load so consumers
// share the same curve across the app — the duration / easing
// is the source of truth for card-style expand-collapse motion.
export const cardLayoutTransition = LinearTransition.duration(300).easing(
  Easing.inOut(Easing.ease),
);
