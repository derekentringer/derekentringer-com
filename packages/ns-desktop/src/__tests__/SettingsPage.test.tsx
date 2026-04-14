import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../pages/SettingsPage.tsx";
import { CommandProvider } from "../commands/index.ts";
import { useEditorSettings } from "../hooks/useEditorSettings.ts";
import { useAiSettings } from "../hooks/useAiSettings.ts";

const mockSetUserFromLogin = vi.fn();
let mockUser: { totpEnabled: boolean } | null = { totpEnabled: false };

vi.mock("../context/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: mockUser,
    setUserFromLogin: mockSetUserFromLogin,
  }),
}));

const mockSetupTotp = vi.fn();
const mockVerifyTotpSetup = vi.fn();
const mockDisableTotp = vi.fn();
const mockGetMe = vi.fn();

vi.mock("../api/auth.ts", () => ({
  setupTotp: (...args: unknown[]) => mockSetupTotp(...args),
  verifyTotpSetup: (...args: unknown[]) => mockVerifyTotpSetup(...args),
  disableTotp: (...args: unknown[]) => mockDisableTotp(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

beforeEach(() => {
  localStorage.clear();
  mockUser = { totpEnabled: false };
  mockSetUserFromLogin.mockReset();
  mockSetupTotp.mockReset();
  mockVerifyTotpSetup.mockReset();
  mockDisableTotp.mockReset();
  mockGetMe.mockReset();
});

function SettingsPageWrapper(props: {
  onBack: () => void;
  onChangePassword?: () => void;
  onTrashRetentionChange?: (days: number) => void;
}) {
  const { settings, updateSetting } = useEditorSettings();
  const { settings: aiSettings, updateSetting: updateAiSetting } = useAiSettings();
  return (
    <CommandProvider>
      <SettingsPage
        onBack={props.onBack}
        onChangePassword={props.onChangePassword}
        onTrashRetentionChange={props.onTrashRetentionChange}
        editorSettings={settings}
        updateEditorSetting={updateSetting}
        aiSettings={aiSettings}
        updateAiSetting={updateAiSetting}
      />
    </CommandProvider>
  );
}

function renderSettingsPage(props?: { onTrashRetentionChange?: (days: number) => void }) {
  const onBack = vi.fn();
  const onTrashRetentionChange = props?.onTrashRetentionChange ?? vi.fn();
  const result = render(
    <SettingsPageWrapper onBack={onBack} onTrashRetentionChange={onTrashRetentionChange} />,
  );
  return { ...result, onBack, onTrashRetentionChange };
}

describe("SettingsPage", () => {
  // --- Headings ---

  it("renders Back button", () => {
    renderSettingsPage();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("renders all sidebar tab buttons", () => {
    renderSettingsPage();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trash" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Version History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI Features" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
  });

  // --- Account ---

  it("renders Change button in My Account section", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "My Account" }));
    expect(screen.getByText("Change")).toBeInTheDocument();
  });

  it("calls onChangePassword when Change button clicked", async () => {
    const onChangePassword = vi.fn();
    const onBack = vi.fn();
    render(
      <SettingsPageWrapper onBack={onBack} onChangePassword={onChangePassword} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "My Account" }));
    await userEvent.click(screen.getByText("Change"));
    expect(onChangePassword).toHaveBeenCalledTimes(1);
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

  // --- Editor Preferences ---

  it("renders default view mode radio group", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByRole("radiogroup", { name: "Default view mode" })).toBeInTheDocument();
    expect(screen.getByLabelText("Editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Split")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview")).toBeInTheDocument();
  });

  it("renders line numbers and word wrap toggles", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByText("Line numbers")).toBeInTheDocument();
    expect(screen.getByText("Word wrap")).toBeInTheDocument();
  });

  it("renders auto-save delay select", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByLabelText("Auto-save delay")).toBeInTheDocument();
  });

  it("renders tab size radio group", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByRole("radiogroup", { name: "Tab size" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 spaces")).toBeInTheDocument();
    expect(screen.getByLabelText("4 spaces")).toBeInTheDocument();
  });

  it("changing view mode persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    await userEvent.click(screen.getByLabelText("Split"));
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.defaultViewMode).toBe("split");
  });

  it("changing auto-save delay persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    const select = screen.getByLabelText("Auto-save delay");
    await userEvent.selectOptions(select, "2000");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.autoSaveDelay).toBe(2000);
  });

  // --- Trash ---

  it("renders trash retention dropdown with default value", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Trash" }));
    const select = screen.getByLabelText("Trash retention period");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("30");
  });

  it("changing trash retention updates localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Trash" }));
    const select = screen.getByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "14");
    expect(localStorage.getItem("ns-desktop:trashRetentionDays")).toBe("14");
  });

  // --- Version History ---

  it("renders version interval dropdown", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Version History" }));
    const select = screen.getByLabelText("Version capture interval");
    expect(select).toBeInTheDocument();
  });

  it("changing version interval persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Version History" }));
    const select = screen.getByLabelText("Version capture interval");
    await userEvent.selectOptions(select, "30");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.versionIntervalMinutes).toBe(30);
  });

  // --- Two-Factor Authentication (Security tab) ---

  it("renders Security sidebar tab button", () => {
    renderSettingsPage();
    expect(screen.getByRole("button", { name: "Security" })).toBeInTheDocument();
  });

  it("shows Enable 2FA button when totpEnabled is false", async () => {
    mockUser = { totpEnabled: false };
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByText("Enable 2FA")).toBeInTheDocument();
  });

  it("shows Enable 2FA button in Two-factor authentication row when not enabled", async () => {
    mockUser = { totpEnabled: false };
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByText("Two-factor authentication")).toBeInTheDocument();
    expect(screen.getByText("Enable 2FA")).toBeInTheDocument();
  });

  it("calls setupTotp on Enable 2FA click and shows QR code", async () => {
    mockUser = { totpEnabled: false };
    mockSetupTotp.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,test",
      secret: "TESTSECRET123",
    });
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    await userEvent.click(screen.getByText("Enable 2FA"));
    await waitFor(() => {
      expect(mockSetupTotp).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByAltText("TOTP QR Code")).toBeInTheDocument();
    expect(screen.getByText(/TESTSECRET123/)).toBeInTheDocument();
  });

  it("shows verification input and Verify & Enable button during setup", async () => {
    mockUser = { totpEnabled: false };
    mockSetupTotp.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,test",
      secret: "TESTSECRET123",
    });
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    await userEvent.click(screen.getByText("Enable 2FA"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter 6-digit code")).toBeInTheDocument();
    });
    expect(screen.getByText("Verify & Enable")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows Enabled badge when user.totpEnabled is true", async () => {
    mockUser = { totpEnabled: true };
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Two-factor authentication")).toBeInTheDocument();
  });

  it("shows Disable 2FA button when enabled", async () => {
    mockUser = { totpEnabled: true };
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByText("Disable 2FA")).toBeInTheDocument();
  });

  it("shows backup codes after successful verify setup", async () => {
    mockUser = { totpEnabled: false };
    mockSetupTotp.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,test",
      secret: "TESTSECRET123",
    });
    mockVerifyTotpSetup.mockResolvedValue({
      backupCodes: ["code1", "code2", "code3"],
    });
    mockGetMe.mockResolvedValue({ totpEnabled: true });
    renderSettingsPage();

    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    await userEvent.click(screen.getByText("Enable 2FA"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter 6-digit code")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Enter 6-digit code");
    await userEvent.type(input, "123456");
    await userEvent.click(screen.getByText("Verify & Enable"));

    await waitFor(() => {
      expect(screen.getByText("2FA enabled successfully!")).toBeInTheDocument();
    });
    expect(screen.getByText("code1")).toBeInTheDocument();
    expect(screen.getByText("code2")).toBeInTheDocument();
    expect(screen.getByText("code3")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  // --- Keyboard Shortcuts ---

  it("renders Keyboard Shortcuts sidebar tab button", () => {
    renderSettingsPage();
    expect(screen.getByRole("button", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
  });

  it("displays all shortcut descriptions from command registry", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Keyboard Shortcuts" }));
    expect(screen.getByText("Save Note")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.getByText("Focus Search")).toBeInTheDocument();
    expect(screen.getByText("Command Palette")).toBeInTheDocument();
  });

  // --- Navigation ---

  it("calls onBack when Back button clicked", async () => {
    const { onBack } = renderSettingsPage();
    await userEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onTrashRetentionChange when trash retention changes", async () => {
    const onTrashRetentionChange = vi.fn();
    renderSettingsPage({ onTrashRetentionChange });
    await userEvent.click(screen.getByRole("button", { name: "Trash" }));
    const select = screen.getByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "7");
    expect(onTrashRetentionChange).toHaveBeenCalledWith(7);
  });

  // --- AI Features ---

  it("renders AI Features sidebar tab button", () => {
    renderSettingsPage();
    expect(screen.getByRole("button", { name: "AI Features" })).toBeInTheDocument();
  });

  it("renders master AI toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Enable AI features")).toBeInTheDocument();
  });

  it("renders inline completions toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Inline completions")).toBeInTheDocument();
  });

  it("renders Continue writing toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Continue writing")).toBeInTheDocument();
  });

  it("shows completion style radios when completions enabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, completions: true }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByRole("radiogroup", { name: "Completion style" })).toBeInTheDocument();
    expect(screen.getByLabelText("Continue writing")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown assist")).toBeInTheDocument();
    expect(screen.getByLabelText("Brief")).toBeInTheDocument();
  });

  it("hides completion style radios when completions disabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, completions: false }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.queryByRole("radiogroup", { name: "Completion style" })).not.toBeInTheDocument();
  });

  it("renders summarize toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Summarize")).toBeInTheDocument();
  });

  it("renders auto-tag suggestions toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Auto-tag suggestions")).toBeInTheDocument();
  });

  it("renders select-and-rewrite toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Select-and-rewrite")).toBeInTheDocument();
  });

  it("displays AI Rewrite keyboard shortcut", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Keyboard Shortcuts" }));
    expect(screen.getByText("AI Rewrite")).toBeInTheDocument();
  });

  it("displays continue writing shortcut", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Keyboard Shortcuts" }));
    expect(screen.getByText("Continue Writing")).toBeInTheDocument();
  });

  it("displays toggle focus mode shortcut", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "Keyboard Shortcuts" }));
    expect(screen.getByText("Toggle Focus Mode")).toBeInTheDocument();
  });

  it("renders Audio notes toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("Audio notes")).toBeInTheDocument();
  });

  it("shows recording source radios when audio notes enabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, audioNotes: true }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByRole("radiogroup", { name: "Recording source" })).toBeInTheDocument();
    expect(screen.getByLabelText("Microphone only")).toBeInTheDocument();
    expect(screen.getByLabelText("Meeting mode")).toBeInTheDocument();
  });

  it("hides recording source radios when audio notes disabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, audioNotes: false }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.queryByRole("radiogroup", { name: "Recording source" })).not.toBeInTheDocument();
  });

  it("recording source selection persists to localStorage", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, audioNotes: true, recordingSource: "microphone" }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    await userEvent.click(screen.getByLabelText("Meeting mode"));
    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.recordingSource).toBe("meeting");
  });

  it("renders AI assistant chat toggle", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    expect(screen.getByText("AI assistant chat")).toBeInTheDocument();
  });

  it("qaAssistant toggle is disabled when semanticSearch is off", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, semanticSearch: false }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    const toggles = screen.getAllByRole("switch");
    const qaToggle = toggles.find(
      (t) => t.closest("label")?.textContent?.includes("AI assistant chat"),
    );
    expect(qaToggle).toBeDefined();
    expect(qaToggle).toBeDisabled();
  });

  it("qaAssistant toggle is enabled when semanticSearch is on", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, semanticSearch: true }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    const toggles = screen.getAllByRole("switch");
    const qaToggle = toggles.find(
      (t) => t.closest("label")?.textContent?.includes("AI assistant chat"),
    );
    expect(qaToggle).toBeDefined();
    expect(qaToggle).not.toBeDisabled();
  });

  it("toggling semanticSearch off auto-disables qaAssistant", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, semanticSearch: true, qaAssistant: true }),
    );
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    // Find and click the semantic search toggle to turn it off
    const toggles = screen.getAllByRole("switch");
    const semanticToggle = toggles.find(
      (t) => t.closest("label")?.textContent?.includes("Semantic search"),
    );
    expect(semanticToggle).toBeDefined();
    await userEvent.click(semanticToggle!);
    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.qaAssistant).toBe(false);
  });

  it("toggling master AI switch persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole("button", { name: "AI Features" }));
    const toggles = screen.getAllByRole("switch");
    const aiToggle = toggles.find(
      (t) => t.closest("label")?.textContent?.includes("Enable AI features"),
    );
    expect(aiToggle).toBeDefined();
    await userEvent.click(aiToggle!);
    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.masterAiEnabled).toBe(false);
  });
});
