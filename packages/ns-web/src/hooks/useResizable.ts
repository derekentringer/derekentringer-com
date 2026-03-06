import { useState, useRef, useCallback } from "react";

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
