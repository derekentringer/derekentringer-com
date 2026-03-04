import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../pages/SettingsPage.tsx";

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("../api/ai.ts", () => ({
  enableEmbeddings: vi.fn().mockResolvedValue({ enabled: true }),
  disableEmbeddings: vi.fn().mockResolvedValue({ enabled: false }),
  getEmbeddingStatus: vi.fn().mockResolvedValue({ enabled: false, pendingCount: 0, totalWithEmbeddings: 0 }),
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
  it("renders six toggle switches", () => {
    renderSettingsPage();

    expect(screen.getByText("Inline completions")).toBeInTheDocument();
    expect(screen.getByText("Summarize")).toBeInTheDocument();
    expect(screen.getByText("Auto-tag suggestions")).toBeInTheDocument();
    expect(screen.getByText("Select-and-rewrite")).toBeInTheDocument();
    expect(screen.getByText("Semantic search")).toBeInTheDocument();
    expect(screen.getByText("Audio notes")).toBeInTheDocument();
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
    expect(switches).toHaveLength(6);
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
        semanticSearch: false,
      }),
    );

    renderSettingsPage();

    const switches = screen.getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
    expect(switches[1]).toHaveAttribute("aria-checked", "false");
    expect(switches[2]).toHaveAttribute("aria-checked", "true");
  });

  it("renders semantic search toggle", () => {
    renderSettingsPage();

    expect(screen.getByText("Semantic search")).toBeInTheDocument();
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

  // --- Keyboard Shortcuts section ---

  it("renders Keyboard Shortcuts heading", () => {
    renderSettingsPage();

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("displays all shortcut descriptions", () => {
    renderSettingsPage();

    expect(screen.getByText("Save note")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.getAllByText("AI Rewrite (with selection)")).toHaveLength(2);
    expect(screen.getByText("Accept AI completion")).toBeInTheDocument();
    expect(screen.getByText("Dismiss AI completion / rewrite menu")).toBeInTheDocument();
  });

  it("audio notes toggle renders", () => {
    renderSettingsPage();
    expect(screen.getByText("Audio notes")).toBeInTheDocument();
  });

  it("shows audio mode radio group when audio notes enabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        audioNotes: true,
        audioMode: "memo",
      }),
    );

    renderSettingsPage();

    expect(screen.getByRole("radiogroup", { name: "Audio mode" })).toBeInTheDocument();
    expect(screen.getByLabelText("Meeting notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Lecture notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Memo")).toBeInTheDocument();
    expect(screen.getByLabelText("Verbatim")).toBeInTheDocument();
  });
});
