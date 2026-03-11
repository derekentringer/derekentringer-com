import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../pages/SettingsPage.tsx";
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
    <SettingsPage
      onBack={props.onBack}
      onChangePassword={props.onChangePassword}
      onTrashRetentionChange={props.onTrashRetentionChange}
      editorSettings={settings}
      updateEditorSetting={updateSetting}
      aiSettings={aiSettings}
      updateAiSetting={updateAiSetting}
    />
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

  it("renders Settings heading", () => {
    renderSettingsPage();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders Back button", () => {
    renderSettingsPage();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("renders all section headings", () => {
    renderSettingsPage();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Editor Preferences")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Version History")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
    expect(screen.getByText("AI Features")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  // --- Account ---

  it("renders Change Password button in Account section", () => {
    renderSettingsPage();
    expect(screen.getByText("Change Password")).toBeInTheDocument();
  });

  it("calls onChangePassword when Change Password button clicked", async () => {
    const onChangePassword = vi.fn();
    const onBack = vi.fn();
    render(
      <SettingsPageWrapper onBack={onBack} onChangePassword={onChangePassword} />,
    );
    await userEvent.click(screen.getByText("Change Password"));
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

  // --- Trash ---

  it("renders trash retention dropdown with default value", () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Trash retention period");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("30");
  });

  it("changing trash retention updates localStorage", async () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "14");
    expect(localStorage.getItem("ns-desktop:trashRetentionDays")).toBe("14");
  });

  // --- Version History ---

  it("renders version interval dropdown", () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Version capture interval");
    expect(select).toBeInTheDocument();
  });

  it("changing version interval persists to localStorage", async () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Version capture interval");
    await userEvent.selectOptions(select, "30");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.versionIntervalMinutes).toBe(30);
  });

  // --- Two-Factor Authentication ---

  it("renders Two-Factor Authentication section heading", () => {
    renderSettingsPage();
    expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
  });

  it("shows Enable 2FA button when totpEnabled is false", () => {
    mockUser = { totpEnabled: false };
    renderSettingsPage();
    expect(screen.getByText("Enable 2FA")).toBeInTheDocument();
  });

  it("shows description text when 2FA not enabled", () => {
    mockUser = { totpEnabled: false };
    renderSettingsPage();
    expect(screen.getByText(/Add an extra layer of security/)).toBeInTheDocument();
  });

  it("calls setupTotp on Enable 2FA click and shows QR code", async () => {
    mockUser = { totpEnabled: false };
    mockSetupTotp.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,test",
      secret: "TESTSECRET123",
    });
    renderSettingsPage();
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
    await userEvent.click(screen.getByText("Enable 2FA"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter 6-digit code")).toBeInTheDocument();
    });
    expect(screen.getByText("Verify & Enable")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows Enabled badge when user.totpEnabled is true", () => {
    mockUser = { totpEnabled: true };
    renderSettingsPage();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
  });

  it("shows Disable 2FA button when enabled", () => {
    mockUser = { totpEnabled: true };
    renderSettingsPage();
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

  it("renders Keyboard Shortcuts section", () => {
    renderSettingsPage();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("displays all shortcut descriptions", () => {
    renderSettingsPage();
    expect(screen.getByText("Save note")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.getByText("Focus search")).toBeInTheDocument();
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
    const select = screen.getByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "7");
    expect(onTrashRetentionChange).toHaveBeenCalledWith(7);
  });

  // --- AI Features ---

  it("renders AI Features section heading", () => {
    renderSettingsPage();
    expect(screen.getByText("AI Features")).toBeInTheDocument();
  });

  it("renders master AI toggle", () => {
    renderSettingsPage();
    expect(screen.getByText("Enable AI features")).toBeInTheDocument();
  });

  it("renders inline completions toggle", () => {
    renderSettingsPage();
    expect(screen.getByText("Inline completions")).toBeInTheDocument();
  });

  it("shows completion style radios when completions enabled", async () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, completions: true }),
    );
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Completion style" })).toBeInTheDocument();
    expect(screen.getByLabelText("Continue writing")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown assist")).toBeInTheDocument();
    expect(screen.getByLabelText("Brief")).toBeInTheDocument();
  });

  it("hides completion style radios when completions disabled", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: true, completions: false }),
    );
    renderSettingsPage();
    expect(screen.queryByRole("radiogroup", { name: "Completion style" })).not.toBeInTheDocument();
  });

  it("renders summarize toggle", () => {
    renderSettingsPage();
    expect(screen.getByText("Summarize")).toBeInTheDocument();
  });

  it("renders auto-tag suggestions toggle", () => {
    renderSettingsPage();
    expect(screen.getByText("Auto-tag suggestions")).toBeInTheDocument();
  });

  it("toggling master AI switch persists to localStorage", async () => {
    renderSettingsPage();
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
