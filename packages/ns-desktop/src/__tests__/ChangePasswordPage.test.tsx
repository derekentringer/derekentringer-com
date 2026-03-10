import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordPage } from "../pages/ChangePasswordPage.tsx";

const mockChangePassword = vi.fn();

vi.mock("../api/auth.ts", () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}));

beforeEach(() => {
  mockChangePassword.mockReset();
});

function renderPage(props?: { onBack?: () => void }) {
  const onBack = props?.onBack ?? vi.fn();
  const result = render(<ChangePasswordPage onBack={onBack} />);
  return { ...result, onBack };
}

describe("ChangePasswordPage", () => {
  it("renders the form with NoteSync header", () => {
    renderPage();
    expect(screen.getByText("NoteSync")).toBeInTheDocument();
    expect(screen.getByText("Change your password")).toBeInTheDocument();
  });

  it("renders all three password inputs", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Current password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm new password")).toBeInTheDocument();
  });

  it("renders submit button disabled when fields empty", () => {
    renderPage();
    const button = screen.getByRole("button", { name: "Change password" });
    expect(button).toBeDisabled();
  });

  it("shows error when passwords do not match", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Current password"), "oldpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "NewPass123!");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "Different123!");

    const form = screen.getByRole("button", { name: "Change password" });
    await userEvent.click(form);

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("shows error when password strength is weak", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Current password"), "oldpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "short");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "short");

    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    // validatePasswordStrength should return an error for weak passwords
    await waitFor(() => {
      expect(screen.getByText(/at least/i)).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("calls changePassword API and onBack on success", async () => {
    mockChangePassword.mockResolvedValue(undefined);
    const onBack = vi.fn();
    render(<ChangePasswordPage onBack={onBack} />);

    await userEvent.type(screen.getByPlaceholderText("Current password"), "oldpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "NewStrongPass123!");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "NewStrongPass123!");

    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith("oldpass", "NewStrongPass123!");
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows API error on failure", async () => {
    mockChangePassword.mockRejectedValue(new Error("Current password is incorrect"));
    renderPage();

    await userEvent.type(screen.getByPlaceholderText("Current password"), "wrongpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "NewStrongPass123!");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "NewStrongPass123!");

    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(screen.getByText("Current password is incorrect")).toBeInTheDocument();
    });
  });

  it("shows loading state while submitting", async () => {
    let resolvePromise: () => void;
    mockChangePassword.mockReturnValue(new Promise<void>((resolve) => { resolvePromise = resolve; }));
    const onBack = vi.fn();
    render(<ChangePasswordPage onBack={onBack} />);

    await userEvent.type(screen.getByPlaceholderText("Current password"), "oldpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "NewStrongPass123!");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "NewStrongPass123!");

    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByText("Changing...")).toBeInTheDocument();

    resolvePromise!();
    await waitFor(() => {
      expect(onBack).toHaveBeenCalled();
    });
  });
});
