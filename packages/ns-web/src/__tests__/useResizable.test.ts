import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizable } from "../hooks/useResizable.ts";

const defaults = {
  direction: "vertical" as const,
  initialSize: 256,
  minSize: 100,
  maxSize: 500,
  storageKey: "test-size",
};

beforeEach(() => {
  localStorage.clear();
});

describe("useResizable", () => {
  it("uses initialSize when localStorage is empty", () => {
    const { result } = renderHook(() => useResizable(defaults));
    expect(result.current.size).toBe(256);
    expect(result.current.isDragging).toBe(false);
  });

  it("restores size from localStorage", () => {
    localStorage.setItem("test-size", "300");
    const { result } = renderHook(() => useResizable(defaults));
    expect(result.current.size).toBe(300);
  });

  it("clamps stored value that exceeds maxSize", () => {
    localStorage.setItem("test-size", "999");
    const { result } = renderHook(() => useResizable(defaults));
    expect(result.current.size).toBe(500);
  });

  it("clamps stored value below minSize", () => {
    localStorage.setItem("test-size", "10");
    const { result } = renderHook(() => useResizable(defaults));
    expect(result.current.size).toBe(100);
  });

  it("ignores non-numeric localStorage value", () => {
    localStorage.setItem("test-size", "abc");
    const { result } = renderHook(() => useResizable(defaults));
    expect(result.current.size).toBe(256);
  });

  it("persists to localStorage on drag end", () => {
    const { result } = renderHook(() => useResizable(defaults));

    // Simulate pointer down
    const pointerDownEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
      clientY: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(pointerDownEvent);
    });

    expect(result.current.isDragging).toBe(true);

    // Simulate pointer move (move 50px right for vertical)
    act(() => {
      const moveEvent = new PointerEvent("pointermove", { clientX: 250, clientY: 200 });
      document.dispatchEvent(moveEvent);
    });

    expect(result.current.size).toBe(306); // 256 + 50

    // Simulate pointer up
    act(() => {
      const upEvent = new PointerEvent("pointerup");
      document.dispatchEvent(upEvent);
    });

    expect(result.current.isDragging).toBe(false);
    expect(localStorage.getItem("test-size")).toBe("306");
  });

  it("clamps size during drag to min/max", () => {
    const { result } = renderHook(() => useResizable(defaults));

    const pointerDownEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
      clientY: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(pointerDownEvent);
    });

    // Move far beyond maxSize
    act(() => {
      const moveEvent = new PointerEvent("pointermove", { clientX: 1000, clientY: 200 });
      document.dispatchEvent(moveEvent);
    });

    expect(result.current.size).toBe(500); // clamped to max

    act(() => {
      const upEvent = new PointerEvent("pointerup");
      document.dispatchEvent(upEvent);
    });
  });

  it("re-clamps current size when maxSize shrinks below it", () => {
    localStorage.setItem("test-size", "400");
    const { result, rerender } = renderHook(
      ({ maxSize }: { maxSize: number }) => useResizable({ ...defaults, maxSize }),
      { initialProps: { maxSize: 500 } },
    );
    expect(result.current.size).toBe(400);

    rerender({ maxSize: 300 });
    expect(result.current.size).toBe(300);
    expect(localStorage.getItem("test-size")).toBe("300");
  });

  it("re-clamps current size when minSize rises above it", () => {
    localStorage.setItem("test-size", "150");
    const { result, rerender } = renderHook(
      ({ minSize }: { minSize: number }) => useResizable({ ...defaults, minSize }),
      { initialProps: { minSize: 100 } },
    );
    expect(result.current.size).toBe(150);

    rerender({ minSize: 200 });
    expect(result.current.size).toBe(200);
  });

  it("uses clientY for horizontal direction", () => {
    const { result } = renderHook(() =>
      useResizable({ ...defaults, direction: "horizontal", initialSize: 160 }),
    );

    const pointerDownEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.onPointerDown(pointerDownEvent);
    });

    // Move 40px down (clientY)
    act(() => {
      const moveEvent = new PointerEvent("pointermove", { clientX: 100, clientY: 240 });
      document.dispatchEvent(moveEvent);
    });

    expect(result.current.size).toBe(200); // 160 + 40

    act(() => {
      const upEvent = new PointerEvent("pointerup");
      document.dispatchEvent(upEvent);
    });
  });
});
