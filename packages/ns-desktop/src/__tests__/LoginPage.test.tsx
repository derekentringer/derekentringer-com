import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginPage } from "../pages/LoginPage.tsx";
import { AuthProvider } from "../context/AuthContext.tsx";
import type { ReactNode } from "react";

// Mock the auth API
vi.mock("../api/auth.ts", () => ({
  login: vi.fn(),
  verifyTotp: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue(null),
  getMe: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));

vi.mock("../api/client.ts", () => ({
  setOnAuthFailure: vi.fn(),
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  clearRefreshToken: vi.fn(),
}));

import { login as apiLogin, verifyTotp } from "../api/auth.ts";

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("LoginPage", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders NsLogo and NoteSync heading", async () => {
    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("NoteSync")).toBeInTheDocument();
    });
  });

  it("renders email and password inputs", async () => {
    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  });

  it("renders Sign in button disabled when inputs empty", async () => {
    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    });
  });

  it("calls login on form submit", async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: "token",
      expiresIn: 900,
      user: { id: "1", email: "test@test.com", role: "user", displayName: null, totpEnabled: false, createdAt: "", updatedAt: "" },
    });

    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(apiLogin).toHaveBeenCalledWith({ email: "test@test.com", password: "password123" });
    });
  });

  it("displays error message on login failure", async () => {
    vi.mocked(apiLogin).mockRejectedValue(new Error("Invalid credentials"));

    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("shows TOTP form when login requires TOTP", async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      requiresTotp: true,
      totpToken: "totp-token-123",
    } as any);

    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Enter the 6-digit code from your authenticator app")).toBeInTheDocument();
    });
  });

  it("navigates to register view", async () => {
    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("Create account")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create account"));
    expect(mockNavigate).toHaveBeenCalledWith("register");
  });

  it("navigates to forgot-password view", async () => {
    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("Forgot password?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Forgot password?"));
    expect(mockNavigate).toHaveBeenCalledWith("forgot-password");
  });

  it("TOTP back button returns to login form", async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      requiresTotp: true,
      totpToken: "totp-token-123",
    } as any);

    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Back to login")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Back to login"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });
  });

  it("shows Signing in... while submitting", async () => {
    let resolveLogin: (value: any) => void;
    vi.mocked(apiLogin).mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));

    render(<LoginPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });

    resolveLogin!({
      accessToken: "token",
      expiresIn: 900,
      user: { id: "1", email: "test@test.com", role: "user", displayName: null, totpEnabled: false, createdAt: "", updatedAt: "" },
    });
  });
});
