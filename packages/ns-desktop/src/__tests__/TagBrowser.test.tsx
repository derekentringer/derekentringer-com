import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagBrowser } from "../components/TagBrowser.tsx";
import type { TagInfo } from "@derekentringer/ns-shared";

const defaultProps = {
  tags: [] as TagInfo[],
  activeTags: [] as string[],
  onToggleTag: vi.fn(),
  onRenameTag: vi.fn(),
  onDeleteTag: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TagBrowser", () => {
  it("returns null when there are no tags", () => {
    const { container } = render(<TagBrowser {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders tag pills with counts", () => {
    const tags: TagInfo[] = [
      { name: "work", count: 5 },
      { name: "personal", count: 3 },
    ];
    render(<TagBrowser {...defaultProps} tags={tags} />);

    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("personal")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onToggleTag when a tag is clicked", async () => {
    const onToggleTag = vi.fn();
    const tags: TagInfo[] = [{ name: "work", count: 5 }];

    render(
      <TagBrowser {...defaultProps} tags={tags} onToggleTag={onToggleTag} />,
    );

    await userEvent.click(screen.getByText("work"));
    expect(onToggleTag).toHaveBeenCalledWith("work");
  });

  it("highlights active tags with primary color", () => {
    const tags: TagInfo[] = [{ name: "active", count: 1 }];
    render(
      <TagBrowser {...defaultProps} tags={tags} activeTags={["active"]} />,
    );

    const button = screen.getByText("active").closest("button");
    expect(button).toHaveClass("bg-primary");
  });

  it("shows 'Clear filter' button when tags are active", () => {
    const tags: TagInfo[] = [{ name: "work", count: 5 }];
    render(
      <TagBrowser {...defaultProps} tags={tags} activeTags={["work"]} />,
    );

    expect(screen.getByText("clear filter")).toBeInTheDocument();
  });

  it("does not show 'Clear filter' when no tags are active", () => {
    const tags: TagInfo[] = [{ name: "work", count: 5 }];
    render(<TagBrowser {...defaultProps} tags={tags} />);

    expect(screen.queryByText("Clear filter")).not.toBeInTheDocument();
  });

  it("shows context menu on right-click", async () => {
    const tags: TagInfo[] = [{ name: "work", count: 5 }];
    render(<TagBrowser {...defaultProps} tags={tags} />);

    const button = screen.getByText("work");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });

    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onDeleteTag from context menu", async () => {
    const onDeleteTag = vi.fn();
    const tags: TagInfo[] = [{ name: "remove-me", count: 1 }];
    render(
      <TagBrowser {...defaultProps} tags={tags} onDeleteTag={onDeleteTag} />,
    );

    const button = screen.getByText("remove-me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Delete"));

    expect(onDeleteTag).toHaveBeenCalledWith("remove-me");
  });

  it("enters rename mode from context menu", async () => {
    const tags: TagInfo[] = [{ name: "rename-me", count: 1 }];
    render(<TagBrowser {...defaultProps} tags={tags} />);

    const button = screen.getByText("rename-me");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Rename"));

    // Should show an input with the tag name
    const input = screen.getByDisplayValue("rename-me");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("commits rename on Enter", async () => {
    const onRenameTag = vi.fn();
    const tags: TagInfo[] = [{ name: "old-name", count: 1 }];
    render(
      <TagBrowser {...defaultProps} tags={tags} onRenameTag={onRenameTag} />,
    );

    const button = screen.getByText("old-name");
    await userEvent.pointer({ keys: "[MouseRight]", target: button });
    await userEvent.click(screen.getByText("Rename"));

    const input = screen.getByDisplayValue("old-name");
    await userEvent.clear(input);
    await userEvent.type(input, "new-name{Enter}");

    expect(onRenameTag).toHaveBeenCalledWith("old-name", "new-name");
  });
});
