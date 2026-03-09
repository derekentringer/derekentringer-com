import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";

describe("ConfirmDialog", () => {
  it("renders title and message", () => {
    render(
      <ConfirmDialog
        title="Delete Note"
        message="My Note Title"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Delete Note")).toBeInTheDocument();
    expect(screen.getByText("My Note Title")).toBeInTheDocument();
  });

  it("renders Cancel and Delete buttons", () => {
    render(
      <ConfirmDialog
        title="Delete Note"
        message="test"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete"
        message="test"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Delete button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Delete"
        message="test"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const deleteButtons = screen.getAllByText("Delete");
    const deleteBtn = deleteButtons.find((el) => el.tagName === "BUTTON")!;
    await userEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
