import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.tsx";

// Mock auth API to prevent network calls
vi.mock("../api/auth.ts", () => ({
  login: vi.fn(),
  refreshSession: vi.fn().mockResolvedValue(null),
  logout: vi.fn(),
}));

vi.mock("../api/client.ts", () => ({
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
  setOnAuthFailure: vi.fn(),
  apiFetch: vi.fn(),
  tokenManager: {
    setOnAuthFailure: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getMsUntilExpiry: vi.fn().mockReturnValue(null),
  },
}));

describe("App", () => {
  it("redirects to login page when not authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText("NoteSync");
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("renders the login page at /login", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText("NoteSync");
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("redirects unknown routes to / which shows login", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByText("NoteSync");
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });
});
