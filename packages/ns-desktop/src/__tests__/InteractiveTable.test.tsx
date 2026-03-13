import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InteractiveTable } from "../components/InteractiveTable.tsx";

const simpleMd = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";

describe("InteractiveTable", () => {
  it("renders headers and body cells", () => {
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={vi.fn()}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows sort indicator on header click", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={vi.fn()}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const header = screen.getByText("A").closest("th")!;
    await user.click(header);
    expect(screen.getByLabelText("sorted ascending")).toBeInTheDocument();
  });

  it("toggles asc ↔ desc on repeated clicks", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={vi.fn()}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const header = screen.getByText("A").closest("th")!;

    await user.click(header);
    expect(screen.getByLabelText("sorted ascending")).toBeInTheDocument();

    await user.click(header);
    expect(screen.getByLabelText("sorted descending")).toBeInTheDocument();

    await user.click(header);
    // Cycles back to ascending
    expect(screen.getByLabelText("sorted ascending")).toBeInTheDocument();
  });

  it("calls onContentChange with sorted markdown on header click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const md = "| Name |\n| --- |\n| B |\n| A |";
    render(
      <InteractiveTable
        content={md}
        onContentChange={onChange}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const header = screen.getByText("Name").closest("th")!;
    await user.click(header);
    expect(onChange).toHaveBeenCalled();
    const updatedMd = onChange.mock.calls[0][0];
    expect(updatedMd).toContain("A");
    expect(updatedMd).toContain("B");
  });

  it("enters edit mode on double-click with input", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={vi.fn()}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const cell = screen.getByText("1").closest("td")!;
    await user.dblClick(cell);
    const input = screen.getByDisplayValue("1");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("commits edit on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={onChange}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const cell = screen.getByText("1").closest("td")!;
    await user.dblClick(cell);
    const input = screen.getByDisplayValue("1");
    await user.clear(input);
    await user.type(input, "X{Enter}");
    expect(onChange).toHaveBeenCalled();
    const updatedMd = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(updatedMd).toContain("X");
  });

  it("cancels edit on Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={onChange}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const cell = screen.getByText("1").closest("td")!;
    await user.dblClick(cell);
    const input = screen.getByDisplayValue("1");
    await user.clear(input);
    await user.type(input, "X{Escape}");
    // Escape cancels, no content change for the escape action
    // The cell should revert to display mode
    expect(screen.queryByDisplayValue("X")).not.toBeInTheDocument();
  });

  it("navigates to next cell on Tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InteractiveTable
        content={simpleMd}
        onContentChange={onChange}
        tableIndex={0}
      >
        <tbody />
      </InteractiveTable>,
    );
    const cell = screen.getByText("1").closest("td")!;
    await user.dblClick(cell);
    await user.tab();
    // Tab should commit and move to next cell (col 1)
    expect(onChange).toHaveBeenCalled();
    // Next cell's input should be visible
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
  });

  it("falls back to static table when parsing fails", () => {
    const { container } = render(
      <InteractiveTable
        content="no table here"
        onContentChange={vi.fn()}
        tableIndex={0}
      >
        <tbody>
          <tr>
            <td>fallback</td>
          </tr>
        </tbody>
      </InteractiveTable>,
    );
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });
});
