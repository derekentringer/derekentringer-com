import { useState, useCallback, useEffect } from "react";
import type { LayoutChangeEvent } from "react-native";

export interface UseClampedRowsOptions {
  /** Number of items currently rendered. When this changes the
   *  cached natural height is reset so the next layout pass
   *  re-measures. */
  itemCount: number;
  /** Maximum number of rows to show when collapsed. */
  maxLines: number;
  /** Vertical gap between rows (matches the container's flex
   *  `gap`). */
  rowGap: number;
  /** Vertical chrome (border + paddingVertical sum) added by the
   *  container around its row content. Included in the clamped
   *  maxHeight so the clamp lands on whole-row boundaries. */
  chrome?: number;
}

/**
 * Measure-and-clamp helper for flex-wrap row layouts (tag chips,
 * etc.). Renders all items naturally first, captures the natural
 * height + a single unit (chip) height, and once both are known
 * decides whether to apply a `maxHeight` clamp + show the
 * caller's chevron toggle.
 */
export function useClampedRows({
  itemCount,
  maxLines,
  rowGap,
  chrome = 0,
}: UseClampedRowsOptions) {
  const [expanded, setExpanded] = useState(false);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [unitHeight, setUnitHeight] = useState<number | null>(null);

  const collapsedHeight =
    unitHeight !== null
      ? chrome + maxLines * unitHeight + (maxLines - 1) * rowGap
      : null;

  const hasOverflow =
    naturalHeight !== null &&
    collapsedHeight !== null &&
    naturalHeight > collapsedHeight + 2;

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    // Inner row container is always unclamped — the wrapping
    // Animated.View applies the maxHeight clamp, so inner's
    // onLayout reports natural height every time.
    setNaturalHeight(e.nativeEvent.layout.height);
  }, []);

  const handleUnitLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setUnitHeight((prev) => (prev === null ? h : prev));
  }, []);

  // When the item count changes the cached natural height is
  // stale — clear it so we re-measure on the next render. Causes
  // a brief un-clamp flicker but keeps overflow detection
  // correct.
  useEffect(() => {
    setNaturalHeight(null);
  }, [itemCount]);

  return {
    expanded,
    setExpanded,
    hasOverflow,
    collapsedHeight,
    naturalHeight,
    handleContainerLayout,
    handleUnitLayout,
  };
}
