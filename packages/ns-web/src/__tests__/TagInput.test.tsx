import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagInput } from "../components/TagInput.tsx";

describe("TagInput", () => {
  it("renders existing tags as pills", () => {
    render(
      <TagInput
        tags={["react", "typescript"]}
        allTags={["react", "typescript", "javascript"]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("shows placeholder when no tags", () => {
    render(
      <TagInput tags={[]} allTags={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByPlaceholderText("e.g. work, meeting, project")).toBeInTheDocument();
  });

  it("adds a tag on Enter", async () => {
    const onChange = vi.fn();
    render(
      <TagInput tags={["existing"]} allTags={[]} onChange={onChange} />,
    );

    const input = screen.getByLabelText("Add tag");
    await userEvent.type(input, "newtag{Enter}");

    expect(onChange).toHaveBeenCalledWith(["existing", "newtag"]);
  });

  it("adds a tag on comma", async () => {
    const onChange = vi.fn();
    render(
      <TagInput tags={[]} allTags={[]} onChange={onChange} />,
    );

    const input = screen.getByLabelText("Add tag");
    await userEvent.type(input, "newtag,");

    expect(onChange).toHaveBeenCalledWith(["newtag"]);
  });

  it("removes a tag when x button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        tags={["react", "typescript"]}
        allTags={[]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByLabelText("Remove tag react"));
    expect(onChange).toHaveBeenCalledWith(["typescript"]);
  });

  it("removes last tag on Backspace with empty input", async () => {
    const onChange = vi.fn();
    render(
      <TagInput
        tags={["react", "typescript"]}
        allTags={[]}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Add tag");
    await userEvent.click(input);
    await userEvent.keyboard("{Backspace}");

    expect(onChange).toHaveBeenCalledWith(["react"]);
  });

  it("does not add duplicate tags", async () => {
    const onChange = vi.fn();
    render(
      <TagInput tags={["react"]} allTags={[]} onChange={onChange} />,
    );

    const input = screen.getByLabelText("Add tag");
    await userEvent.type(input, "react{Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows autocomplete suggestions", async () => {
    render(
      <TagInput
        tags={[]}
        allTags={["javascript", "java", "typescript"]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Add tag");
    await userEvent.type(input, "java");

    expect(screen.getByText("javascript")).toBeInTheDocument();
    expect(screen.getByText("java")).toBeInTheDocument();
    expect(screen.queryByText("typescript")).not.toBeInTheDocument();
  });
});
