import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResizeDivider } from "../components/ResizeDivider.tsx";

describe("ResizeDivider", () => {
  it("renders with row-resize cursor for horizontal direction", () => {
    const { container } = render(
      <ResizeDivider direction="horizontal" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild as HTMLElement;
    expect(divider.className).toContain("cursor-row-resize");
  });

  it("renders with col-resize cursor for vertical direction", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild as HTMLElement;
    expect(divider.className).toContain("cursor-col-resize");
  });

  it("calls onPointerDown when pressed", async () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={false} onPointerDown={onPointerDown} />,
    );
    const divider = container.firstElementChild as HTMLElement;

    // Fire native pointer event since userEvent doesn't support pointerDown directly
    divider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("shows accent color when isDragging is true", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={true} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild as HTMLElement;
    const line = divider.firstElementChild as HTMLElement;
    expect(line.className).toContain("bg-ring");
    expect(line.className).not.toContain("bg-border");
  });

  it("shows border color when not dragging", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild as HTMLElement;
    const line = divider.firstElementChild as HTMLElement;
    expect(line.className).toContain("bg-border");
    expect(line.className).not.toContain("bg-ring");
  });

  it("has touch-action none for touch support", () => {
    const { container } = render(
      <ResizeDivider direction="horizontal" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild as HTMLElement;
    expect(divider.style.touchAction).toBe("none");
  });
});
