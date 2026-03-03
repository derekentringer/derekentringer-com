import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../pages/SettingsPage.tsx";

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

beforeEach(() => {
  localStorage.clear();
});

function renderSettingsPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  it("renders three toggle switches", () => {
    renderSettingsPage();

    expect(screen.getByText("Inline completions")).toBeInTheDocument();
    expect(screen.getByText("Summarize")).toBeInTheDocument();
    expect(screen.getByText("Auto-tag suggestions")).toBeInTheDocument();
  });

  it("renders Settings heading", () => {
    renderSettingsPage();

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders AI Features section heading", () => {
    renderSettingsPage();

    expect(screen.getByText("AI Features")).toBeInTheDocument();
  });

  it("all toggles default to off", () => {
    renderSettingsPage();

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(3);
    switches.forEach((s) => {
      expect(s).toHaveAttribute("aria-checked", "false");
    });
  });

  it("toggling a switch persists to localStorage", async () => {
    renderSettingsPage();

    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[0]); // Toggle "Inline completions"

    expect(switches[0]).toHaveAttribute("aria-checked", "true");

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completions).toBe(true);
    expect(stored.summarize).toBe(false);
    expect(stored.tagSuggestions).toBe(false);
  });

  it("reads initial state from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        completions: true,
        summarize: false,
        tagSuggestions: true,
      }),
    );

    renderSettingsPage();

    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
    expect(switches[1]).toHaveAttribute("aria-checked", "false");
    expect(switches[2]).toHaveAttribute("aria-checked", "true");
  });

  it("renders back to notes link", () => {
    renderSettingsPage();

    expect(screen.getByText("Back to notes")).toBeInTheDocument();
  });
});
