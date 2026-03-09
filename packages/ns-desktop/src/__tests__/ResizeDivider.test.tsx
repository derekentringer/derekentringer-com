import { render } from "@testing-library/react";
import { ResizeDivider } from "../components/ResizeDivider.tsx";

describe("ResizeDivider", () => {
  it("renders with vertical cursor class", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild!;
    expect(divider).toHaveClass("cursor-col-resize");
  });

  it("renders with horizontal cursor class", () => {
    const { container } = render(
      <ResizeDivider direction="horizontal" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild!;
    expect(divider).toHaveClass("cursor-row-resize");
  });

  it("applies ring color when dragging", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={true} onPointerDown={vi.fn()} />,
    );
    // The inner line div is the child of the outer wrapper
    const wrapper = container.firstElementChild!;
    const line = wrapper.firstElementChild!;
    expect(line.className).toContain("bg-ring");
  });

  it("applies border color when not dragging", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const wrapper = container.firstElementChild!;
    const line = wrapper.firstElementChild!;
    expect(line.className).toContain("bg-border");
  });

  it("sets touch-action none for pointer events", () => {
    const { container } = render(
      <ResizeDivider direction="vertical" isDragging={false} onPointerDown={vi.fn()} />,
    );
    const divider = container.firstElementChild as HTMLElement;
    expect(divider.style.touchAction).toBe("none");
  });
});
