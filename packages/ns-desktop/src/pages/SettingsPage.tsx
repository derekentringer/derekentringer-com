import { useState, useMemo } from "react";
import type { TotpSetupResponse } from "@derekentringer/shared";
import {
  ACCENT_PRESETS,
  type EditorSettings,
  type ThemeMode,
  type ViewModeDefault,
  type TabSizeOption,
  type AccentColorPreset,
} from "../hooks/useEditorSettings.ts";
import type { AiSettings, CompletionStyle } from "../hooks/useAiSettings.ts";
import { useAuth } from "../context/AuthContext.tsx";
import { setupTotp, verifyTotpSetup, disableTotp, getMe } from "../api/auth.ts";

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="relative group ml-1.5 inline-flex items-center" aria-label={tooltip}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md bg-card border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {tooltip}
      </span>
    </span>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
  info,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  info?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between py-3 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="text-sm text-foreground flex items-center">
        {label}
        {info && <InfoIcon tooltip={info} />}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-border"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

function RadioOption<T extends string | number>({
  name,
  value,
  currentValue,
  label,
  onChange,
  disabled,
}: {
  name: string;
  value: T;
  currentValue: T;
  label: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 py-1 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <input
        type="radio"
        name={name}
        value={String(value)}
        checked={currentValue === value}
        onChange={() => !disabled && onChange(value)}
        className="accent-primary"
        disabled={disabled}
        aria-label={label}
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

const AI_TOGGLE_SETTINGS: { key: "completions" | "summarize" | "tagSuggestions" | "rewrite"; label: string; info: string }[] = [
  { key: "completions", label: "Inline completions", info: "AI suggests text as you type. Press Tab to accept, Escape to dismiss." },
  { key: "summarize", label: "Summarize", info: "Generate a short AI summary of your note, shown below the title." },
  { key: "tagSuggestions", label: "Auto-tag suggestions", info: "AI analyzes your note content and suggests relevant tags." },
  { key: "rewrite", label: "Select-and-rewrite", info: "Select text and right-click (or Cmd+Shift+R) to rewrite it with AI." },
];

const STYLE_OPTIONS: { value: CompletionStyle; label: string; info: string }[] = [
  { value: "continue", label: "Continue writing", info: "Predicts and continues your natural writing style." },
  { value: "markdown", label: "Markdown assist", info: "Suggests markdown formatting like headings, lists, and code blocks." },
  { value: "brief", label: "Brief", info: "Short, concise completions — a few words at a time." },
];

const KEYBOARD_SHORTCUTS: { shortcut: string; macShortcut: string; description: string }[] = [
  { shortcut: "Ctrl + S", macShortcut: "Cmd + S", description: "Save note" },
  { shortcut: "Ctrl + B", macShortcut: "Cmd + B", description: "Bold" },
  { shortcut: "Ctrl + I", macShortcut: "Cmd + I", description: "Italic" },
  { shortcut: "Ctrl + K", macShortcut: "Cmd + K", description: "Focus search" },
  { shortcut: "Ctrl + Shift + R", macShortcut: "Cmd + Shift + R", description: "AI Rewrite (with selection)" },
  { shortcut: "Right-click", macShortcut: "Right-click", description: "AI Rewrite (with selection)" },
  { shortcut: "Escape", macShortcut: "Escape", description: "Dismiss AI completion / rewrite menu" },
];

const AUTO_SAVE_OPTIONS: { value: number; label: string }[] = [
  { value: 500, label: "500ms" },
  { value: 1000, label: "1s" },
  { value: 1500, label: "1.5s" },
  { value: 2000, label: "2s" },
  { value: 3000, label: "3s" },
  { value: 5000, label: "5s" },
];

const VERSION_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Every save" },
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes (default)" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "60 minutes" },
];

const TRASH_RETENTION_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days (default)" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 0, label: "Never" },
];

const TRASH_RETENTION_KEY = "ns-desktop:trashRetentionDays";

interface SettingsPageProps {
  onBack: () => void;
  onChangePassword?: () => void;
  onTrashRetentionChange?: (days: number) => void;
  editorSettings: EditorSettings;
  updateEditorSetting: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
  aiSettings: AiSettings;
  updateAiSetting: <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => void;
}

export function SettingsPage({ onBack, onChangePassword, onTrashRetentionChange, editorSettings, updateEditorSetting, aiSettings, updateAiSetting }: SettingsPageProps) {
  const { user, setUserFromLogin } = useAuth();

  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(() => {
    const stored = localStorage.getItem(TRASH_RETENTION_KEY);
    return stored !== null ? Number(stored) : 30;
  });

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpSetupCode, setTotpSetupCode] = useState("");
  const [totpSetupError, setTotpSetupError] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisableError, setTotpDisableError] = useState("");
  const [totpShowDisable, setTotpShowDisable] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);

  function handleThemeChange(theme: ThemeMode) {
    updateEditorSetting("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    const preset = ACCENT_PRESETS[editorSettings.accentColor];
    const isLight = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.style.setProperty("--color-primary", isLight ? preset.light : preset.dark);
    document.documentElement.style.setProperty("--color-primary-hover", isLight ? preset.lightHover : preset.darkHover);
    document.documentElement.style.setProperty("--color-ring", isLight ? preset.light : preset.dark);
    document.documentElement.style.setProperty("--color-primary-contrast", editorSettings.accentColor === "black" ? "#ffffff" : "#000000");
  }

  function handleAccentColorChange(preset: AccentColorPreset) {
    updateEditorSetting("accentColor", preset);
    const colors = ACCENT_PRESETS[preset];
    const theme = editorSettings.theme;
    const isLight = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.style.setProperty("--color-primary", isLight ? colors.light : colors.dark);
    document.documentElement.style.setProperty("--color-primary-hover", isLight ? colors.lightHover : colors.darkHover);
    document.documentElement.style.setProperty("--color-ring", isLight ? colors.light : colors.dark);
    document.documentElement.style.setProperty("--color-primary-contrast", preset === "black" ? "#ffffff" : "#000000");
  }

  function handleTrashRetentionChange(days: number) {
    setTrashRetentionDays(days);
    localStorage.setItem(TRASH_RETENTION_KEY, String(days));
    onTrashRetentionChange?.(days);
  }

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );

  return (
    <div className="flex h-full items-start justify-center bg-background overflow-auto">
      <div className="w-full max-w-2xl p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>

        <h1 className="text-xl font-semibold text-foreground mb-6">Settings</h1>

        <div className="flex flex-col gap-4">
          {/* Appearance */}
          <SectionCard title="Appearance">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-foreground mb-1 block">Theme</label>
                <div className="flex gap-4" role="radiogroup" aria-label="Theme">
                  <RadioOption name="theme" value={"dark" as ThemeMode} currentValue={editorSettings.theme} label="Dark" onChange={handleThemeChange} />
                  <RadioOption name="theme" value={"light" as ThemeMode} currentValue={editorSettings.theme} label="Light" onChange={handleThemeChange} />
                  <RadioOption name="theme" value={"system" as ThemeMode} currentValue={editorSettings.theme} label="System" onChange={handleThemeChange} />
                </div>
              </div>

              <div>
                <label className="text-sm text-foreground mb-1 block">
                  Editor font size: {editorSettings.editorFontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={editorSettings.editorFontSize}
                  onChange={(e) => updateEditorSetting("editorFontSize", Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Editor font size"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>10px</span>
                  <span>24px</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-foreground mb-2 block">Accent color</label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
                  {(Object.keys(ACCENT_PRESETS) as AccentColorPreset[]).map((preset) => (
                    <button
                      key={preset}
                      role="radio"
                      aria-checked={editorSettings.accentColor === preset}
                      aria-label={preset}
                      onClick={() => handleAccentColorChange(preset)}
                      className="relative w-7 h-7 rounded-full border-2 transition-all cursor-pointer"
                      style={{
                        backgroundColor: ACCENT_PRESETS[preset].dark,
                        borderColor: editorSettings.accentColor === preset ? "var(--color-foreground)" : "transparent",
                      }}
                    >
                      {editorSettings.accentColor === preset && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={preset === "white" || preset === "amber" ? "#000" : "#fff"}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="absolute inset-0 w-4 h-4 m-auto"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Editor Preferences */}
          <SectionCard title="Editor Preferences">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-foreground mb-1 block">Default view mode</label>
                <div className="flex gap-4" role="radiogroup" aria-label="Default view mode">
                  <RadioOption name="defaultViewMode" value={"editor" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Editor" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                  <RadioOption name="defaultViewMode" value={"split" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Split" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                  <RadioOption name="defaultViewMode" value={"preview" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Preview" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                </div>
              </div>

              <div className="divide-y divide-border">
                <ToggleSwitch
                  label="Line numbers"
                  checked={editorSettings.showLineNumbers}
                  onChange={(v) => updateEditorSetting("showLineNumbers", v)}
                  info="Show line numbers in the editor gutter."
                />
                <ToggleSwitch
                  label="Word wrap"
                  checked={editorSettings.wordWrap}
                  onChange={(v) => updateEditorSetting("wordWrap", v)}
                  info="Wrap long lines instead of horizontal scrolling."
                />
              </div>

              <div>
                <label className="text-sm text-foreground mb-1 block">Auto-save delay</label>
                <select
                  value={editorSettings.autoSaveDelay}
                  onChange={(e) => updateEditorSetting("autoSaveDelay", Number(e.target.value))}
                  className="appearance-none bg-input border border-border rounded-md pl-3 pr-7 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer bg-[length:10px_10px] bg-[right_8px_center] bg-no-repeat"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                  aria-label="Auto-save delay"
                >
                  {AUTO_SAVE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-foreground mb-1 block">Tab size</label>
                <div className="flex gap-4" role="radiogroup" aria-label="Tab size">
                  <RadioOption name="tabSize" value={2 as TabSizeOption} currentValue={editorSettings.tabSize} label="2 spaces" onChange={(v) => updateEditorSetting("tabSize", v)} />
                  <RadioOption name="tabSize" value={4 as TabSizeOption} currentValue={editorSettings.tabSize} label="4 spaces" onChange={(v) => updateEditorSetting("tabSize", v)} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Trash */}
          <SectionCard title="Trash">
            <div>
              <label className="text-sm text-foreground mb-1 block flex items-center">
                Auto-delete after
                <InfoIcon tooltip="Trashed notes are permanently deleted after this period. Set to 'Never' to keep trashed notes indefinitely." />
              </label>
              <select
                value={trashRetentionDays}
                onChange={(e) => handleTrashRetentionChange(Number(e.target.value))}
                className="appearance-none bg-input border border-border rounded-md pl-3 pr-7 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer bg-[length:10px_10px] bg-[right_8px_center] bg-no-repeat"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                aria-label="Trash retention period"
              >
                {TRASH_RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </SectionCard>

          {/* Version History */}
          <SectionCard title="Version History">
            <div>
              <label className="text-sm text-foreground mb-1 block flex items-center">
                Capture interval
                <InfoIcon tooltip="How often a version snapshot is saved when you edit a note. Set to 'Every save' to capture a version on every save." />
              </label>
              <select
                value={editorSettings.versionIntervalMinutes}
                onChange={(e) => updateEditorSetting("versionIntervalMinutes", Number(e.target.value))}
                className="appearance-none bg-input border border-border rounded-md pl-3 pr-7 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer bg-[length:10px_10px] bg-[right_8px_center] bg-no-repeat"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                aria-label="Version capture interval"
              >
                {VERSION_INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </SectionCard>

          {/* Account */}
          <SectionCard title="Account">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Update your account credentials.
              </p>
              <button
                onClick={onChangePassword}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Change Password
              </button>
            </div>
          </SectionCard>

          {/* Two-Factor Authentication */}
          <SectionCard title="Two-Factor Authentication">
            {totpBackupCodes ? (
              <div className="space-y-3">
                <p className="text-sm text-green-500 font-medium">2FA enabled successfully!</p>
                <p className="text-sm text-muted-foreground">
                  Save these backup codes in a safe place. Each code can only be used once.
                </p>
                <div className="bg-background border border-border rounded-md p-3 font-mono text-sm space-y-1">
                  {totpBackupCodes.map((code) => (
                    <div key={code} className="text-foreground">{code}</div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(totpBackupCodes.join("\n"));
                    }}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => setTotpBackupCodes(null)}
                    className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : totpSetup ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div className="flex justify-center">
                  <img src={totpSetup.qrCodeDataUrl} alt="TOTP QR Code" className="w-48 h-48 rounded" />
                </div>
                <p className="text-xs text-muted-foreground text-center break-all">
                  Manual entry: {totpSetup.secret}
                </p>
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={totpSetupCode}
                  onChange={(e) => setTotpSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center tracking-widest"
                />
                {totpSetupError && <p className="text-sm text-error text-center">{totpSetupError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setTotpSetupError("");
                      setTotpLoading(true);
                      try {
                        const result = await verifyTotpSetup(totpSetupCode);
                        setTotpBackupCodes(result.backupCodes);
                        setTotpSetup(null);
                        setTotpSetupCode("");
                        const updated = await getMe();
                        setUserFromLogin(updated);
                      } catch (err) {
                        setTotpSetupError(err instanceof Error ? err.message : "Verification failed");
                      } finally {
                        setTotpLoading(false);
                      }
                    }}
                    disabled={totpSetupCode.length !== 6 || totpLoading}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {totpLoading ? "Verifying..." : "Verify & Enable"}
                  </button>
                  <button
                    onClick={() => { setTotpSetup(null); setTotpSetupCode(""); setTotpSetupError(""); }}
                    className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : user?.totpEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 py-2">
                  <span className="text-sm text-foreground">Status:</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">Enabled</span>
                </div>
                {totpShowDisable ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Enter current TOTP code"
                      value={totpDisableCode}
                      onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center tracking-widest"
                    />
                    {totpDisableError && <p className="text-sm text-error text-center">{totpDisableError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setTotpDisableError("");
                          setTotpLoading(true);
                          try {
                            await disableTotp(totpDisableCode);
                            setTotpShowDisable(false);
                            setTotpDisableCode("");
                            const updated = await getMe();
                            setUserFromLogin(updated);
                          } catch (err) {
                            setTotpDisableError(err instanceof Error ? err.message : "Failed to disable");
                          } finally {
                            setTotpLoading(false);
                          }
                        }}
                        disabled={totpDisableCode.length !== 6 || totpLoading}
                        className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {totpLoading ? "Disabling..." : "Confirm Disable"}
                      </button>
                      <button
                        onClick={() => { setTotpShowDisable(false); setTotpDisableCode(""); setTotpDisableError(""); }}
                        className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setTotpShowDisable(true)}
                    className="px-3 py-1.5 rounded-md text-sm text-error/70 hover:text-error transition-colors cursor-pointer"
                  >
                    Disable 2FA
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your account with a TOTP authenticator app.
                </p>
                <button
                  onClick={async () => {
                    setTotpLoading(true);
                    try {
                      const result = await setupTotp();
                      setTotpSetup(result);
                    } catch (err) {
                      setTotpSetupError(err instanceof Error ? err.message : "Setup failed");
                    } finally {
                      setTotpLoading(false);
                    }
                  }}
                  disabled={totpLoading}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {totpLoading ? "Loading..." : "Enable 2FA"}
                </button>
                {totpSetupError && <p className="text-sm text-error">{totpSetupError}</p>}
              </div>
            )}
          </SectionCard>

          {/* AI Features */}
          <SectionCard title="AI Features">
            <div className="divide-y divide-border">
              <ToggleSwitch
                label="Enable AI features"
                checked={aiSettings.masterAiEnabled}
                onChange={(v) => updateAiSetting("masterAiEnabled", v)}
                info="Master toggle for all AI features. When off, all AI features are disabled."
              />

              {AI_TOGGLE_SETTINGS.map(({ key, label, info }) => (
                <div key={key}>
                  <ToggleSwitch
                    label={label}
                    checked={aiSettings[key]}
                    onChange={(value) => updateAiSetting(key, value)}
                    info={info}
                    disabled={!aiSettings.masterAiEnabled}
                  />
                  {key === "completions" && aiSettings.completions && aiSettings.masterAiEnabled && (
                    <div className="pb-3 pl-1" role="radiogroup" aria-label="Completion style">
                      {STYLE_OPTIONS.map(({ value, label: styleLabel, info: styleInfo }) => (
                        <label key={value} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="radio"
                            name="completionStyle"
                            value={value}
                            checked={aiSettings.completionStyle === value}
                            onChange={() => updateAiSetting("completionStyle", value)}
                            className="accent-primary"
                            aria-label={styleLabel}
                          />
                          <span className="text-sm text-muted-foreground">{styleLabel}</span>
                          <InfoIcon tooltip={styleInfo} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Keyboard Shortcuts */}
          <SectionCard title="Keyboard Shortcuts">
            <div className="space-y-2">
              {KEYBOARD_SHORTCUTS.map(({ shortcut, macShortcut, description }) => (
                <div key={`${shortcut}-${description}`} className="flex items-center justify-between py-1">
                  <span className="text-sm text-foreground">{description}</span>
                  <kbd className="px-2 py-0.5 rounded bg-background border border-border text-xs text-muted-foreground font-mono whitespace-nowrap ml-3">
                    {isMac ? macShortcut : shortcut}
                  </kbd>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
