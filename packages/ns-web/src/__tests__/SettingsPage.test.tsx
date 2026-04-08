import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../pages/SettingsPage.tsx";
import { CommandProvider } from "../commands/index.ts";

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("../api/ai.ts", () => ({
  enableEmbeddings: vi.fn().mockResolvedValue({ enabled: true }),
  disableEmbeddings: vi.fn().mockResolvedValue({ enabled: false }),
  getEmbeddingStatus: vi.fn().mockResolvedValue({ enabled: false, pendingCount: 0, totalWithEmbeddings: 0 }),
}));

const mockGetTrashRetention = vi.fn().mockResolvedValue({ days: 30 });
const mockSetTrashRetention = vi.fn().mockResolvedValue({ days: 30 });
const mockGetVersionInterval = vi.fn().mockResolvedValue({ minutes: 15 });
const mockSetVersionInterval = vi.fn().mockResolvedValue({ minutes: 15 });

vi.mock("../api/offlineNotes.ts", () => ({
  getTrashRetention: (...args: unknown[]) => mockGetTrashRetention(...args),
  setTrashRetention: (...args: unknown[]) => mockSetTrashRetention(...args),
  getVersionInterval: (...args: unknown[]) => mockGetVersionInterval(...args),
  setVersionInterval: (...args: unknown[]) => mockSetVersionInterval(...args),
}));

vi.mock("../hooks/useOfflineCache.ts", () => ({
  useOfflineCache: () => ({ isOnline: true, lastSyncedAt: new Date(), pendingCount: 0, isSyncing: false, reconciledIds: new Map() }),
}));

vi.mock("../lib/db.ts", () => ({
  getDB: vi.fn().mockResolvedValue({ count: vi.fn().mockResolvedValue(42) }),
  clearAllCaches: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  localStorage.clear();
});

function renderSettingsPage() {
  return render(
    <CommandProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </CommandProvider>,
  );
}

describe("SettingsPage", () => {
  it("renders Settings heading", () => {
    renderSettingsPage();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders back to notes link", () => {
    renderSettingsPage();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  // --- Section headings ---

  it("renders all section headings", () => {
    renderSettingsPage();
    expect(screen.getByText("Editor Preferences")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Version History")).toBeInTheDocument();
    expect(screen.getByText("AI Features")).toBeInTheDocument();
    expect(screen.getByText("Offline Cache")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  // --- Account ---

  it("renders Change Password button in Account section", () => {
    renderSettingsPage();
    expect(screen.getByText("Change Password")).toBeInTheDocument();
  });

  // --- Editor Preferences ---

  it("renders default view mode radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Default view mode" })).toBeInTheDocument();
    expect(screen.getByLabelText("Editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Split")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview")).toBeInTheDocument();
  });

  it("renders line numbers and word wrap toggles", () => {
    renderSettingsPage();
    expect(screen.getByText("Line numbers")).toBeInTheDocument();
    expect(screen.getByText("Word wrap")).toBeInTheDocument();
  });

  it("renders auto-save delay select", () => {
    renderSettingsPage();
    expect(screen.getByLabelText("Auto-save delay")).toBeInTheDocument();
  });

  it("renders tab size radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Tab size" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 spaces")).toBeInTheDocument();
    expect(screen.getByLabelText("4 spaces")).toBeInTheDocument();
  });

  it("changing view mode persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByLabelText("Split"));
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.defaultViewMode).toBe("split");
  });

  it("changing auto-save delay persists to localStorage", async () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Auto-save delay");
    await userEvent.selectOptions(select, "2000");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.autoSaveDelay).toBe(2000);
  });

  // --- Appearance ---

  it("renders theme radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dark")).toBeInTheDocument();
    expect(screen.getByLabelText("Light")).toBeInTheDocument();
    expect(screen.getByLabelText("System")).toBeInTheDocument();
  });

  it("renders font size slider", () => {
    renderSettingsPage();
    expect(screen.getByLabelText("Editor font size")).toBeInTheDocument();
  });

  it("renders accent color swatches", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Accent color" })).toBeInTheDocument();
    const swatches = screen.getAllByRole("radio").filter(
      (el) => el.closest("[aria-label='Accent color']"),
    );
    expect(swatches.length).toBe(11);
  });

  it("clicking accent color swatch persists to localStorage", async () => {
    renderSettingsPage();
    const blueButton = screen.getByRole("radio", { name: "blue" });
    await userEvent.click(blueButton);
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.accentColor).toBe("blue");
  });

  it("changing theme persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByLabelText("Light"));
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.theme).toBe("light");
  });

  // --- AI Features ---

  it("renders master AI toggle", () => {
    renderSettingsPage();
    expect(screen.getByText("Enable AI features")).toBeInTheDocument();
  });

  it("renders eight individual AI toggle switches", () => {
    renderSettingsPage();
    expect(screen.getByText("Inline completions")).toBeInTheDocument();
    expect(screen.getByText("Continue writing")).toBeInTheDocument();
    expect(screen.getByText("Summarize")).toBeInTheDocument();
    expect(screen.getByText("Auto-tag suggestions")).toBeInTheDocument();
    expect(screen.getByText("Select-and-rewrite")).toBeInTheDocument();
    expect(screen.getByText("Semantic search")).toBeInTheDocument();
    expect(screen.getByText("Audio notes")).toBeInTheDocument();
    expect(screen.getByText("AI assistant chat")).toBeInTheDocument();
  });

  it("master AI defaults to on", () => {
    renderSettingsPage();
    // Master toggle + 8 individual + line numbers + word wrap + cursor blink = 12 switches
    const switches = screen.getAllByRole("switch");
    // Master AI toggle is the fourth switch (after line numbers, word wrap, cursor blink)
    const masterSwitch = switches[3];
    expect(masterSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("toggling master AI off disables individual toggles", async () => {
    renderSettingsPage();
    const switches = screen.getAllByRole("switch");
    // Master is index 3
    await userEvent.click(switches[3]);
    expect(switches[3]).toHaveAttribute("aria-checked", "false");

    // All AI toggles after master should be disabled
    for (let i = 4; i <= 11; i++) {
      expect(switches[i]).toBeDisabled();
    }
  });

  it("toggling an AI switch persists to localStorage", async () => {
    renderSettingsPage();
    const switches = screen.getAllByRole("switch");
    // Inline completions is at index 4
    await userEvent.click(switches[4]);

    expect(switches[4]).toHaveAttribute("aria-checked", "true");

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completions).toBe(true);
  });

  it("reads initial AI state from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        masterAiEnabled: true,
        completions: true,
        completionStyle: "continue",
        completionDebounceMs: 600,
        summarize: false,
        tagSuggestions: true,
        semanticSearch: false,
      }),
    );

    renderSettingsPage();
    const switches = screen.getAllByRole("switch");
    // Index 4 = completions, index 6 = summarize, index 7 = tagSuggestions
    expect(switches[4]).toHaveAttribute("aria-checked", "true");  // completions
    expect(switches[6]).toHaveAttribute("aria-checked", "false"); // summarize
    expect(switches[7]).toHaveAttribute("aria-checked", "true");  // tagSuggestions
  });

  it("shows completion style radio group when completions enabled", async () => {
    renderSettingsPage();
    const switches = screen.getAllByRole("switch");
    // Enable completions (index 4)
    await userEvent.click(switches[4]);

    expect(screen.getByRole("radiogroup", { name: "Completion style" })).toBeInTheDocument();
    // Note: "Continue writing" label exists both as a toggle and as a radio option
    expect(screen.getByLabelText("Markdown assist")).toBeInTheDocument();
    expect(screen.getByLabelText("Brief")).toBeInTheDocument();
  });

  it("shows completion delay select when completions enabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        masterAiEnabled: true,
        completions: true,
        completionStyle: "continue",
        completionDebounceMs: 600,
      }),
    );
    renderSettingsPage();
    expect(screen.getByLabelText("Completion delay")).toBeInTheDocument();
  });

  it("hides style radio group when completions disabled", () => {
    renderSettingsPage();
    expect(screen.queryByRole("radiogroup", { name: "Completion style" })).not.toBeInTheDocument();
  });

  it("Q&A toggle is disabled when semantic search is off", () => {
    renderSettingsPage();
    const switches = screen.getAllByRole("switch");
    // Q&A assistant is the last AI toggle (index 11)
    const qaSwitch = switches[11];
    expect(qaSwitch).toBeDisabled();
  });

  it("shows audio mode radio group when audio notes enabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        masterAiEnabled: true,
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

  // --- Offline Cache ---

  it("renders offline cache section", () => {
    renderSettingsPage();
    expect(screen.getByText("Cached notes")).toBeInTheDocument();
    expect(screen.getByText("Last synced")).toBeInTheDocument();
    expect(screen.getByLabelText("Max cached notes")).toBeInTheDocument();
  });

  it("renders clear cache button", () => {
    renderSettingsPage();
    expect(screen.getByText("Clear Cache")).toBeInTheDocument();
  });

  it("clear cache shows confirmation", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByText("Clear Cache"));
    expect(screen.getByText("Clear all cached data?")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  // --- Keyboard Shortcuts ---

  it("renders Keyboard Shortcuts heading", () => {
    renderSettingsPage();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  // --- Trash Retention ---

  it("renders trash retention dropdown with default value", async () => {
    renderSettingsPage();
    const select = await screen.findByLabelText("Trash retention period");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("30");
  });

  it("renders trash retention dropdown with value from API", async () => {
    mockGetTrashRetention.mockResolvedValue({ days: 7 });
    renderSettingsPage();
    const select = await screen.findByLabelText("Trash retention period");
    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe("7");
    });
  });

  it("changing trash retention calls setTrashRetention", async () => {
    mockSetTrashRetention.mockResolvedValue({ days: 14 });
    renderSettingsPage();
    const select = await screen.findByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "14");
    expect(mockSetTrashRetention).toHaveBeenCalledWith(14);
  });

  it("displays all shortcut descriptions from command registry", () => {
    renderSettingsPage();
    expect(screen.getByText("Save Note")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.getByText("AI Rewrite")).toBeInTheDocument();
    expect(screen.getByText("Continue Writing")).toBeInTheDocument();
    expect(screen.getByText("Toggle Focus Mode")).toBeInTheDocument();
    expect(screen.getByText("Command Palette")).toBeInTheDocument();
  });

  // --- Version History ---

  it("renders version interval dropdown with default value", async () => {
    renderSettingsPage();
    const select = await screen.findByLabelText("Version capture interval");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("15");
  });

  it("renders version interval dropdown with value from API", async () => {
    mockGetVersionInterval.mockResolvedValue({ minutes: 5 });
    renderSettingsPage();
    const select = await screen.findByLabelText("Version capture interval");
    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe("5");
    });
  });

  it("changing version interval calls setVersionInterval", async () => {
    mockSetVersionInterval.mockResolvedValue({ minutes: 30 });
    renderSettingsPage();
    const select = await screen.findByLabelText("Version capture interval");
    await userEvent.selectOptions(select, "30");
    expect(mockSetVersionInterval).toHaveBeenCalledWith(30);
  });
});
