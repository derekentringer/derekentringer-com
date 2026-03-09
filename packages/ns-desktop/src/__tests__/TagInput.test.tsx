import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagInput } from "../components/TagInput.tsx";

const defaultProps = {
  tags: [] as string[],
  allTags: [] as string[],
  onChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TagInput", () => {
  it("renders existing tags as pills", () => {
    render(<TagInput {...defaultProps} tags={["work", "important"]} />);

    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("important")).toBeInTheDocument();
  });

  it("shows placeholder when no tags exist", () => {
    render(<TagInput {...defaultProps} />);
    expect(screen.getByPlaceholderText("Add tags...")).toBeInTheDocument();
  });

  it("hides placeholder when tags exist", () => {
    render(<TagInput {...defaultProps} tags={["work"]} />);
    expect(screen.queryByPlaceholderText("Add tags...")).not.toBeInTheDocument();
  });

  it("adds a tag on Enter", async () => {
    const onChange = vi.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "new-tag{Enter}");

    expect(onChange).toHaveBeenCalledWith(["new-tag"]);
  });

  it("adds a tag on comma", async () => {
    const onChange = vi.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "comma-tag,");

    expect(onChange).toHaveBeenCalledWith(["comma-tag"]);
  });

  it("removes the last tag on Backspace when input is empty", async () => {
    const onChange = vi.fn();
    render(
      <TagInput {...defaultProps} tags={["first", "second"]} onChange={onChange} />,
    );

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.click(input);
    await userEvent.keyboard("{Backspace}");

    expect(onChange).toHaveBeenCalledWith(["first"]);
  });

  it("removes a specific tag when X is clicked", async () => {
    const onChange = vi.fn();
    render(
      <TagInput {...defaultProps} tags={["keep", "remove"]} onChange={onChange} />,
    );

    const removeButton = screen.getByRole("button", { name: "Remove tag remove" });
    await userEvent.click(removeButton);

    expect(onChange).toHaveBeenCalledWith(["keep"]);
  });

  it("prevents duplicate tags", async () => {
    const onChange = vi.fn();
    render(
      <TagInput {...defaultProps} tags={["existing"]} onChange={onChange} />,
    );

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "existing{Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("lowercases tags", async () => {
    const onChange = vi.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "UPPERCASE{Enter}");

    expect(onChange).toHaveBeenCalledWith(["uppercase"]);
  });

  it("shows autocomplete suggestions matching input", async () => {
    render(
      <TagInput
        {...defaultProps}
        allTags={["work", "workout", "personal"]}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "wor");

    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("workout")).toBeInTheDocument();
    expect(screen.queryByText("personal")).not.toBeInTheDocument();
  });

  it("filters suggestions to match input", async () => {
    render(
      <TagInput
        {...defaultProps}
        allTags={["work", "writing", "personal"]}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "per");

    expect(screen.getByText("personal")).toBeInTheDocument();
    expect(screen.queryByText("work")).not.toBeInTheDocument();
  });

  it("excludes already-selected tags from suggestions", async () => {
    render(
      <TagInput
        {...defaultProps}
        tags={["work"]}
        allTags={["work", "personal"]}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "w");

    // "work" should not appear in suggestions since it's already selected
    // The button text "work" already exists as a pill, but not in the dropdown
    const suggestionButtons = screen.getAllByText("work");
    // Only one "work" text (the pill), not in dropdown
    expect(suggestionButtons).toHaveLength(1);
  });

  it("adds tag from suggestion click", async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        {...defaultProps}
        allTags={["personal"]}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Add tag" });
    await userEvent.type(input, "per");

    // Click the suggestion
    const suggestion = screen.getByText("personal");
    await userEvent.click(suggestion);

    expect(onChange).toHaveBeenCalledWith(["personal"]);
  });
});
