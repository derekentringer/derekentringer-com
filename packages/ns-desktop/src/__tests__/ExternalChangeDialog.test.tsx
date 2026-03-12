import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExternalChangeDialog } from "../components/ExternalChangeDialog.tsx";

describe("ExternalChangeDialog", () => {
  it("renders the dialog title", () => {
    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("File Changed Externally")).toBeInTheDocument();
  });

  it("renders the note title in the description", () => {
    render(
      <ExternalChangeDialog
        noteTitle="Important Document"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Important Document/)).toBeInTheDocument();
    expect(screen.getByText(/has been modified outside/)).toBeInTheDocument();
  });

  it("renders all four action buttons", () => {
    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Reload from File")).toBeInTheDocument();
    expect(screen.getByText("Keep My Version")).toBeInTheDocument();
    expect(screen.getByText("View Diff")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onReload when Reload from File is clicked", async () => {
    const onReload = vi.fn();

    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={onReload}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Reload from File"));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("calls onKeepMine when Keep My Version is clicked", async () => {
    const onKeepMine = vi.fn();

    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={onKeepMine}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Keep My Version"));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDiff when View Diff is clicked", async () => {
    const onViewDiff = vi.fn();

    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={onViewDiff}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("View Diff"));
    expect(onViewDiff).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();

    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("styles Reload from File as primary button", () => {
    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const reloadBtn = screen.getByText("Reload from File").closest("button")!;
    expect(reloadBtn.className).toContain("bg-primary");
    expect(reloadBtn.className).toContain("text-primary-contrast");
  });

  it("has cursor-pointer on all buttons", () => {
    render(
      <ExternalChangeDialog
        noteTitle="My Note"
        onReload={vi.fn()}
        onKeepMine={vi.fn()}
        onViewDiff={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const reloadBtn = screen.getByText("Reload from File").closest("button")!;
    const keepMineBtn = screen.getByText("Keep My Version").closest("button")!;
    const viewDiffBtn = screen.getByText("View Diff").closest("button")!;
    const cancelBtn = screen.getByText("Cancel").closest("button")!;

    expect(reloadBtn.className).toContain("cursor-pointer");
    expect(keepMineBtn.className).toContain("cursor-pointer");
    expect(viewDiffBtn.className).toContain("cursor-pointer");
    expect(cancelBtn.className).toContain("cursor-pointer");
  });
});
