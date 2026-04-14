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

async function clickTab(name: string) {
  const tab = screen.getByRole("button", { name });
  await userEvent.click(tab);
}

describe("SettingsPage", () => {
  it("renders back to notes link", () => {
    renderSettingsPage();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  // --- Sidebar navigation tabs ---

  it("renders all sidebar navigation tabs", () => {
    renderSettingsPage();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI Features" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offline Cache" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trash" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Version History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Account" })).toBeInTheDocument();
  });

  // --- Account ---

  it("renders Change button in My Account section", async () => {
    renderSettingsPage();
    await clickTab("My Account");
    expect(screen.getByText("Change")).toBeInTheDocument();
  });

  // --- Editor Preferences ---

  it("renders default view mode radio group", async () => {
    renderSettingsPage();
    await clickTab("Editor");
    expect(screen.getByRole("radiogroup", { name: "Default view mode" })).toBeInTheDocument();
    expect(screen.getByLabelText("Editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Split")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview")).toBeInTheDocument();
  });

  it("renders line numbers and word wrap toggles", async () => {
    renderSettingsPage();
    await clickTab("Editor");
    expect(screen.getByText("Line numbers")).toBeInTheDocument();
    expect(screen.getByText("Word wrap")).toBeInTheDocument();
  });

  it("renders auto-save delay select", async () => {
    renderSettingsPage();
    await clickTab("Editor");
    expect(screen.getByLabelText("Auto-save delay")).toBeInTheDocument();
  });

  it("renders tab size radio group", async () => {
    renderSettingsPage();
    await clickTab("Editor");
    expect(screen.getByRole("radiogroup", { name: "Tab size" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 spaces")).toBeInTheDocument();
    expect(screen.getByLabelText("4 spaces")).toBeInTheDocument();
  });

  it("changing view mode persists to localStorage", async () => {
    renderSettingsPage();
    await clickTab("Editor");
    await userEvent.click(screen.getByLabelText("Split"));
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.defaultViewMode).toBe("split");
  });

  it("changing auto-save delay persists to localStorage", async () => {
    renderSettingsPage();
    await clickTab("Editor");
    const select = screen.getByLabelText("Auto-save delay");
    await userEvent.selectOptions(select, "2000");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.autoSaveDelay).toBe(2000);
  });

  // --- Appearance (default active section) ---

  it("renders theme radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dark")).toBeInTheDocument();
    expect(screen.getByLabelText("Light")).toBeInTheDocument();
    expect(screen.getByLabelText("System")).toBeInTheDocument();
  });

  it("renders font size select", () => {
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

  it("renders master AI toggle", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    expect(screen.getByText("Enable AI features")).toBeInTheDocument();
  });

  it("renders eight individual AI toggle switches", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    expect(screen.getByText("Inline completions")).toBeInTheDocument();
    expect(screen.getByText("Continue writing")).toBeInTheDocument();
    expect(screen.getByText("Summarize")).toBeInTheDocument();
    expect(screen.getByText("Auto-tag suggestions")).toBeInTheDocument();
    expect(screen.getByText("Select-and-rewrite")).toBeInTheDocument();
    expect(screen.getByText("Semantic search")).toBeInTheDocument();
    expect(screen.getByText("Audio notes")).toBeInTheDocument();
    expect(screen.getByText("AI assistant chat")).toBeInTheDocument();
  });

  it("master AI defaults to on", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    const switches = screen.getAllByRole("switch");
    // Master AI toggle is the first switch on this section
    const masterSwitch = switches[0];
    expect(masterSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("toggling master AI off disables individual toggles", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    const switches = screen.getAllByRole("switch");
    // Master is index 0 on AI Features section
    await userEvent.click(switches[0]);
    expect(switches[0]).toHaveAttribute("aria-checked", "false");

    // All AI toggles after master should be disabled
    for (let i = 1; i <= 8; i++) {
      expect(switches[i]).toBeDisabled();
    }
  });

  it("toggling an AI switch persists to localStorage", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    const switches = screen.getAllByRole("switch");
    // Inline completions is at index 1 (after master)
    await userEvent.click(switches[1]);

    expect(switches[1]).toHaveAttribute("aria-checked", "true");

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completions).toBe(true);
  });

  it("reads initial AI state from localStorage", async () => {
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
    await clickTab("AI Features");
    const switches = screen.getAllByRole("switch");
    // Index 1 = completions, index 4 = summarize, index 5 = tagSuggestions
    expect(switches[1]).toHaveAttribute("aria-checked", "true");  // completions
    expect(switches[4]).toHaveAttribute("aria-checked", "false"); // summarize
    expect(switches[5]).toHaveAttribute("aria-checked", "true");  // tagSuggestions
  });

  it("shows completion style radio group when completions enabled", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    const switches = screen.getAllByRole("switch");
    // Enable completions (index 1)
    await userEvent.click(switches[1]);

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
    await clickTab("AI Features");
    expect(screen.getByLabelText("Completion delay")).toBeInTheDocument();
  });

  it("hides style radio group when completions disabled", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    expect(screen.queryByRole("radiogroup", { name: "Completion style" })).not.toBeInTheDocument();
  });

  it("Q&A toggle is disabled when semantic search is off", async () => {
    renderSettingsPage();
    await clickTab("AI Features");
    const switches = screen.getAllByRole("switch");
    // Q&A assistant is at index 7 (after semantic search at 6)
    const qaSwitch = switches[7];
    expect(qaSwitch).toBeDisabled();
  });

  // --- Offline Cache ---

  it("renders offline cache section", async () => {
    renderSettingsPage();
    await clickTab("Offline Cache");
    expect(screen.getByText("Cached notes")).toBeInTheDocument();
    expect(screen.getByText("Last synced")).toBeInTheDocument();
    expect(screen.getByLabelText("Max cached notes")).toBeInTheDocument();
  });

  it("renders clear cache button", async () => {
    renderSettingsPage();
    await clickTab("Offline Cache");
    expect(screen.getByText("Clear Cache")).toBeInTheDocument();
  });

  it("clear cache shows confirmation", async () => {
    renderSettingsPage();
    await clickTab("Offline Cache");
    await userEvent.click(screen.getByText("Clear Cache"));
    expect(screen.getByText("Clear all cached data?")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  // --- Keyboard Shortcuts ---

  it("renders Keyboard Shortcuts tab", () => {
    renderSettingsPage();
    expect(screen.getByRole("button", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
  });

  // --- Trash Retention ---

  it("renders trash retention dropdown with default value", async () => {
    renderSettingsPage();
    await clickTab("Trash");
    const select = await screen.findByLabelText("Trash retention period");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("30");
  });

  it("renders trash retention dropdown with value from API", async () => {
    mockGetTrashRetention.mockResolvedValue({ days: 7 });
    renderSettingsPage();
    await clickTab("Trash");
    const select = await screen.findByLabelText("Trash retention period");
    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe("7");
    });
  });

  it("changing trash retention calls setTrashRetention", async () => {
    mockSetTrashRetention.mockResolvedValue({ days: 14 });
    renderSettingsPage();
    await clickTab("Trash");
    const select = await screen.findByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "14");
    expect(mockSetTrashRetention).toHaveBeenCalledWith(14);
  });

  it("displays all shortcut descriptions from command registry", async () => {
    renderSettingsPage();
    await clickTab("Keyboard Shortcuts");
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
    await clickTab("Version History");
    const select = await screen.findByLabelText("Version capture interval");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("15");
  });

  it("renders version interval dropdown with value from API", async () => {
    mockGetVersionInterval.mockResolvedValue({ minutes: 5 });
    renderSettingsPage();
    await clickTab("Version History");
    const select = await screen.findByLabelText("Version capture interval");
    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe("5");
    });
  });

  it("changing version interval calls setVersionInterval", async () => {
    mockSetVersionInterval.mockResolvedValue({ minutes: 30 });
    renderSettingsPage();
    await clickTab("Version History");
    const select = await screen.findByLabelText("Version capture interval");
    await userEvent.selectOptions(select, "30");
    expect(mockSetVersionInterval).toHaveBeenCalledWith(30);
  });
});
