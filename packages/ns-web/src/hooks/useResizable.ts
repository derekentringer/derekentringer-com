import { useState, useRef, useCallback, useEffect } from "react";

export interface UseResizableOptions {
  direction: "horizontal" | "vertical";
  initialSize: number;
  minSize: number;
  maxSize: number;
  storageKey: string;
  invert?: boolean;
}

export interface UseResizableReturn {
  size: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

function readStorage(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const val = Number(raw);
      if (!Number.isNaN(val)) {
        return Math.min(max, Math.max(min, val));
      }
    }
  } catch {
    // localStorage unavailable
  }
  return fallback;
}

export function useResizable({
  direction,
  initialSize,
  minSize,
  maxSize,
  storageKey,
  invert,
}: UseResizableOptions): UseResizableReturn {
  const [size, setSize] = useState(() => readStorage(storageKey, initialSize, minSize, maxSize));
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef({ startPos: 0, startSize: 0 });

  // Re-clamp when min/max bounds shift. Consumers can pass a dynamic
  // maxSize (e.g. derived from a ResizeObserver-measured container)
  // without leaving a stale persisted size above the new ceiling.
  useEffect(() => {
    setSize((current) => {
      const clamped = Math.min(maxSize, Math.max(minSize, current));
      if (clamped !== current) {
        try {
          localStorage.setItem(storageKey, String(clamped));
        } catch {
          // localStorage unavailable
        }
      }
      return clamped;
    });
  }, [minSize, maxSize, storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const pos = direction === "horizontal" ? e.clientY : e.clientX;
      dragRef.current = { startPos: pos, startSize: size };
      setIsDragging(true);

      document.body.style.cursor = direction === "horizontal" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";

      function onPointerMove(ev: PointerEvent) {
        const current = direction === "horizontal" ? ev.clientY : ev.clientX;
        const delta = (current - dragRef.current.startPos) * (invert ? -1 : 1);
        const next = Math.min(maxSize, Math.max(minSize, dragRef.current.startSize + delta));
        setSize(next);
      }

      function onPointerUp() {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // Persist — read latest size from the ref-based calculation
        setSize((current) => {
          try {
            localStorage.setItem(storageKey, String(current));
          } catch {
            // localStorage unavailable
          }
          return current;
        });
      }

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [direction, size, minSize, maxSize, storageKey],
  );

  return { size, isDragging, onPointerDown };
}
