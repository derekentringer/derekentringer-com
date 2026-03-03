import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagBrowser } from "../components/TagBrowser.tsx";

const mockTags = [
  { name: "javascript", count: 5 },
  { name: "react", count: 3 },
  { name: "typescript", count: 2 },
];

describe("TagBrowser", () => {
  it("renders tag pills with counts", () => {
    render(
      <TagBrowser
        tags={mockTags}
        activeTags={[]}
        onToggleTag={vi.fn()}
        onRenameTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );

    expect(screen.getByText("javascript")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders nothing when tags array is empty", () => {
    const { container } = render(
      <TagBrowser
        tags={[]}
        activeTags={[]}
        onToggleTag={vi.fn()}
        onRenameTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("highlights active tags", () => {
    render(
      <TagBrowser
        tags={mockTags}
        activeTags={["react"]}
        onToggleTag={vi.fn()}
        onRenameTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );

    const reactButton = screen.getByText("react").closest("button")!;
    expect(reactButton.className).toContain("bg-primary");
  });

  it("calls onToggleTag when a tag is clicked", async () => {
    const onToggleTag = vi.fn();
    render(
      <TagBrowser
        tags={mockTags}
        activeTags={[]}
        onToggleTag={onToggleTag}
        onRenameTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("react"));
    expect(onToggleTag).toHaveBeenCalledWith("react");
  });

  it("shows clear filter button when tags are active", () => {
    render(
      <TagBrowser
        tags={mockTags}
        activeTags={["react"]}
        onToggleTag={vi.fn()}
        onRenameTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );

    expect(screen.getByText("Clear filter")).toBeInTheDocument();
  });

  it("does not show clear filter button when no tags are active", () => {
    render(
      <TagBrowser
        tags={mockTags}
        activeTags={[]}
        onToggleTag={vi.fn()}
        onRenameTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );

    expect(screen.queryByText("Clear filter")).not.toBeInTheDocument();
  });
});
