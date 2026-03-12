import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage.tsx";
import { AuthProvider } from "../context/AuthContext.tsx";
import type { ReactNode } from "react";

vi.mock("../api/auth.ts", () => ({
  login: vi.fn(),
  verifyTotp: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue(null),
  getMe: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
}));

vi.mock("../api/client.ts", () => ({
  setOnAuthFailure: vi.fn(),
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  clearRefreshToken: vi.fn(),
  tokenManager: {
    setOnAuthFailure: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getMsUntilExpiry: vi.fn().mockReturnValue(null),
  },
}));

import { forgotPassword } from "../api/auth.ts";

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("ForgotPasswordPage", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders NsLogo and NoteSync heading", () => {
    render(<ForgotPasswordPage onNavigate={mockNavigate} />);
    expect(screen.getByText("NoteSync")).toBeInTheDocument();
  });

  it("renders email input and Send reset link button", () => {
    render(<ForgotPasswordPage onNavigate={mockNavigate} />);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("shows success message after submit", async () => {
    vi.mocked(forgotPassword).mockResolvedValue(undefined);

    render(<ForgotPasswordPage onNavigate={mockNavigate} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText(/reset link has been sent/)).toBeInTheDocument();
    });
  });

  it("shows error on failure", async () => {
    vi.mocked(forgotPassword).mockRejectedValue(new Error("Network error"));

    render(<ForgotPasswordPage onNavigate={mockNavigate} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("navigates back to login", () => {
    render(<ForgotPasswordPage onNavigate={mockNavigate} />);

    fireEvent.click(screen.getByText("Back to sign in"));
    expect(mockNavigate).toHaveBeenCalledWith("login");
  });

  it("disables button while submitting", async () => {
    let resolvePromise: () => void;
    vi.mocked(forgotPassword).mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve; }));

    render(<ForgotPasswordPage onNavigate={mockNavigate} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Sending...")).toBeInTheDocument();
    });

    resolvePromise!();
  });
});
