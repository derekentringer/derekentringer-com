import { LayoutAnimation, Platform, UIManager } from "react-native";
import type { LayoutAnimationConfig } from "react-native";

// Android requires opting in to LayoutAnimation. Safe to call at
// module load — `UIManager.setLayoutAnimationEnabledExperimental`
// is idempotent and a no-op on iOS.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Mirrors the `transition-[max-height,opacity] duration-300
// ease-in-out` pattern used across ns-web and ns-desktop for
// sidebar / panel expand-collapse. Use this before any
// setState that triggers a height/opacity-affecting layout
// change so RN animates between the two layout snapshots.
export const cardExpandAnimation: LayoutAnimationConfig = {
  duration: 300,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

/** Schedule the next layout pass to animate with the shared
 *  card-expand curve. Call this immediately before the
 *  setState that flips the expanded flag. */
export function configureCardExpandAnimation(): void {
  LayoutAnimation.configureNext(cardExpandAnimation);
}
