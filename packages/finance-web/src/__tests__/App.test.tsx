import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.tsx";

// Mock auth API to prevent network calls
vi.mock("../api/auth.ts", () => ({
  login: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue(null),
  logout: vi.fn(),
  verifyPin: vi.fn(),
}));

vi.mock("../api/client.ts", () => ({
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
  setOnAuthFailure: vi.fn(),
  apiFetch: vi.fn(),
}));

describe("App", () => {
  it("redirects to login page when not authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // Wait for auth check to complete
    await screen.findByText("Personal Finance");
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
  });

  it("renders the login page at /login", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText("Personal Finance");
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("renders the 404 page for unknown routes", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText("404");
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });
});
