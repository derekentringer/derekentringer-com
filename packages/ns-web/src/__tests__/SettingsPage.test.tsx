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
        completionStyle: "continue",
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

  // --- Completion style radio group ---

  it("shows style radio group when completions enabled", async () => {
    renderSettingsPage();

    // Enable completions
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[0]);

    expect(screen.getByRole("radiogroup", { name: "Completion style" })).toBeInTheDocument();
    expect(screen.getByLabelText("Continue writing")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown assist")).toBeInTheDocument();
    expect(screen.getByLabelText("Brief")).toBeInTheDocument();
  });

  it("hides style radio group when completions disabled", () => {
    renderSettingsPage();

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("selecting a different style persists it", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        completions: true,
        completionStyle: "continue",
        summarize: false,
        tagSuggestions: false,
      }),
    );

    renderSettingsPage();

    const briefRadio = screen.getByLabelText("Brief");
    await userEvent.click(briefRadio);

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completionStyle).toBe("brief");
  });

  it("defaults style selection to Continue writing", async () => {
    renderSettingsPage();

    // Enable completions
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[0]);

    const continueRadio = screen.getByLabelText("Continue writing") as HTMLInputElement;
    expect(continueRadio.checked).toBe(true);
  });
});
