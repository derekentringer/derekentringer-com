import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegisterPage } from "../pages/RegisterPage.tsx";
import { AuthProvider } from "../context/AuthContext.tsx";
import type { ReactNode } from "react";

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

import { register as apiRegister } from "../api/auth.ts";

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("RegisterPage", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders NsLogo and NoteSync heading", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("NoteSync")).toBeInTheDocument();
    });
  });

  it("renders all input fields", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Display name (optional)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm password")).toBeInTheDocument();
  });

  it("renders Create account button", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    });
  });

  it("shows password strength indicator when password entered", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "abc" } });

    await waitFor(() => {
      expect(screen.getByText(/8\+ characters/)).toBeInTheDocument();
    });
  });

  it("shows error when passwords do not match", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "StrongPass1!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "Different1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
  });

  it("shows error on weak password", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "weak" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "weak" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it("calls register on valid submit", async () => {
    vi.mocked(apiRegister).mockResolvedValue({
      accessToken: "token",
      expiresIn: 900,
      user: { id: "1", email: "test@test.com", role: "user", displayName: null, totpEnabled: false, createdAt: "", updatedAt: "" },
    });

    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "StrongPass1!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "StrongPass1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(apiRegister).toHaveBeenCalled();
    });
  });

  it("navigates to login view", async () => {
    render(<RegisterPage onNavigate={mockNavigate} />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("Sign in")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Sign in"));
    expect(mockNavigate).toHaveBeenCalledWith("login");
  });
});
