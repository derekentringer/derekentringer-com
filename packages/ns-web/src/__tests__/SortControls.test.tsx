import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortControls } from "../components/SortControls.tsx";

describe("SortControls", () => {
  it("renders sort field dropdown with current value", () => {
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="desc"
        onSortByChange={vi.fn()}
        onSortOrderChange={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Sort by") as HTMLSelectElement;
    expect(select.value).toBe("updatedAt");
  });

  it("renders all sort field options", () => {
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="desc"
        onSortByChange={vi.fn()}
        onSortOrderChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("calls onSortByChange when field is changed", async () => {
    const onSortByChange = vi.fn();
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="desc"
        onSortByChange={onSortByChange}
        onSortOrderChange={vi.fn()}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "title");
    expect(onSortByChange).toHaveBeenCalledWith("title");
  });

  it("shows down arrow for descending order", () => {
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="desc"
        onSortByChange={vi.fn()}
        onSortOrderChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Sort descending")).toBeInTheDocument();
  });

  it("shows up arrow for ascending order", () => {
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="asc"
        onSortByChange={vi.fn()}
        onSortOrderChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Sort ascending")).toBeInTheDocument();
  });

  it("toggles sort order when direction button is clicked", async () => {
    const onSortOrderChange = vi.fn();
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="desc"
        onSortByChange={vi.fn()}
        onSortOrderChange={onSortOrderChange}
      />,
    );

    await userEvent.click(screen.getByLabelText("Sort descending"));
    expect(onSortOrderChange).toHaveBeenCalledWith("asc");
  });

  it("toggles from asc to desc when clicked", async () => {
    const onSortOrderChange = vi.fn();
    render(
      <SortControls
        sortBy="updatedAt"
        sortOrder="asc"
        onSortByChange={vi.fn()}
        onSortOrderChange={onSortOrderChange}
      />,
    );

    await userEvent.click(screen.getByLabelText("Sort ascending"));
    expect(onSortOrderChange).toHaveBeenCalledWith("desc");
  });
});
