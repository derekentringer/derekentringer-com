import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../context/AuthContext.tsx";

vi.mock("../api/auth.ts", () => ({
  login: vi.fn(),
  register: vi.fn(),
  refreshSession: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

const mockSetOnAuthFailure = vi.fn();
vi.mock("../api/client.ts", () => ({
  setOnAuthFailure: vi.fn(),
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  clearRefreshToken: vi.fn(),
  tokenManager: {
    setOnAuthFailure: (...args: unknown[]) => mockSetOnAuthFailure(...args),
  },
}));

import {
  login as apiLogin,
  register as apiRegister,
  refreshSession,
  logout as apiLogout,
  getMe,
} from "../api/auth.ts";

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user">{auth.user?.email ?? "none"}</span>
      <button onClick={() => auth.login("test@test.com", "password")}>login</button>
      <button onClick={() => auth.register("new@test.com", "password", "New User")}>register</button>
      <button onClick={() => auth.logout()}>logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(refreshSession).mockResolvedValue(null);
  });

  it("provides isLoading=true initially", () => {
    vi.mocked(refreshSession).mockImplementation(() => new Promise(() => {}));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("true");
  });

  it("attempts refresh on mount", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(refreshSession).toHaveBeenCalled();
    });
  });

  it("sets user after successful refresh", async () => {
    vi.mocked(refreshSession).mockResolvedValue({ accessToken: "token", expiresIn: 900 });
    vi.mocked(getMe).mockResolvedValue({
      id: "1",
      email: "test@test.com",
      role: "user",
      displayName: null,
      totpEnabled: false,
      createdAt: "",
      updatedAt: "",
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@test.com");
    });
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
  });

  it("sets isAuthenticated=false on failed refresh", async () => {
    vi.mocked(refreshSession).mockResolvedValue(null);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("login stores tokens and sets user", async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      accessToken: "token",
      expiresIn: 900,
      user: { id: "1", email: "test@test.com", role: "user", displayName: null, totpEnabled: false, createdAt: "", updatedAt: "" },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    await act(async () => {
      screen.getByText("login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@test.com");
    });
  });

  it("logout clears tokens and user", async () => {
    vi.mocked(refreshSession).mockResolvedValue({ accessToken: "token", expiresIn: 900 });
    vi.mocked(getMe).mockResolvedValue({
      id: "1",
      email: "test@test.com",
      role: "user",
      displayName: null,
      totpEnabled: false,
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(apiLogout).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });

    await act(async () => {
      screen.getByText("logout").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("false");
    });
  });

  it("calls onAuthFailure callback", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockSetOnAuthFailure).toHaveBeenCalled();
    });
  });

  it("register stores tokens and sets user", async () => {
    vi.mocked(apiRegister).mockResolvedValue({
      accessToken: "token",
      expiresIn: 900,
      user: { id: "2", email: "new@test.com", role: "user", displayName: "New User", totpEnabled: false, createdAt: "", updatedAt: "" },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    await act(async () => {
      screen.getByText("register").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("new@test.com");
    });
  });
});
