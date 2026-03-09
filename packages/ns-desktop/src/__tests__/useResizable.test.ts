import { renderHook, act } from "@testing-library/react";
import { useResizable } from "../hooks/useResizable.ts";

beforeEach(() => {
  localStorage.clear();
});

describe("useResizable", () => {
  const defaultOpts = {
    direction: "vertical" as const,
    initialSize: 256,
    minSize: 100,
    maxSize: 500,
    storageKey: "test-resize",
  };

  it("uses initialSize when localStorage is empty", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));
    expect(result.current.size).toBe(256);
    expect(result.current.isDragging).toBe(false);
  });

  it("reads persisted size from localStorage", () => {
    localStorage.setItem("test-resize", "300");
    const { result } = renderHook(() => useResizable(defaultOpts));
    expect(result.current.size).toBe(300);
  });

  it("clamps persisted size to minSize", () => {
    localStorage.setItem("test-resize", "50");
    const { result } = renderHook(() => useResizable(defaultOpts));
    expect(result.current.size).toBe(100);
  });

  it("clamps persisted size to maxSize", () => {
    localStorage.setItem("test-resize", "999");
    const { result } = renderHook(() => useResizable(defaultOpts));
    expect(result.current.size).toBe(500);
  });

  it("handles non-numeric localStorage value", () => {
    localStorage.setItem("test-resize", "not-a-number");
    const { result } = renderHook(() => useResizable(defaultOpts));
    expect(result.current.size).toBe(256);
  });

  it("provides onPointerDown callback", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));
    expect(typeof result.current.onPointerDown).toBe("function");
  });

  it("sets isDragging true on pointer down", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));

    act(() => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 200,
      } as unknown as React.PointerEvent;
      result.current.onPointerDown(fakeEvent);
    });

    expect(result.current.isDragging).toBe(true);
  });

  it("resets isDragging on pointer up", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));

    act(() => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 200,
      } as unknown as React.PointerEvent;
      result.current.onPointerDown(fakeEvent);
    });

    expect(result.current.isDragging).toBe(true);

    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(result.current.isDragging).toBe(false);
  });

  it("updates size on pointer move (vertical direction)", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));

    act(() => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 200,
      } as unknown as React.PointerEvent;
      result.current.onPointerDown(fakeEvent);
    });

    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 250, clientY: 200 }),
      );
    });

    // vertical direction uses clientX, delta = 250 - 200 = 50
    expect(result.current.size).toBe(306); // 256 + 50
  });

  it("clamps size during drag to minSize/maxSize", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));

    act(() => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 200,
      } as unknown as React.PointerEvent;
      result.current.onPointerDown(fakeEvent);
    });

    // Move far right — should clamp to maxSize
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 1000, clientY: 200 }),
      );
    });

    expect(result.current.size).toBe(500);
  });

  it("persists size to localStorage on pointer up", () => {
    const { result } = renderHook(() => useResizable(defaultOpts));

    act(() => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 200,
        clientY: 200,
      } as unknown as React.PointerEvent;
      result.current.onPointerDown(fakeEvent);
    });

    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 250, clientY: 200 }),
      );
    });

    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(localStorage.getItem("test-resize")).toBe("306");
  });
});
