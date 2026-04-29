import { Easing } from "react-native";

// Mirrors the `transition-[max-height,opacity] duration-300
// ease-in-out` curve used across ns-web and ns-desktop for
// sidebar / panel expand-collapse. Consumers drive an
// `Animated.Value` (legacy API) with these constants on a
// wrapping `Animated.View`'s `maxHeight`. Per-frame JS-driven
// height changes force RN to reflow on every tick, so siblings
// below the animated card shift smoothly with it instead of
// teleporting to the post-toggle layout.
export const cardAnimDuration = 300;
export const cardAnimEasing = Easing.inOut(Easing.ease);
