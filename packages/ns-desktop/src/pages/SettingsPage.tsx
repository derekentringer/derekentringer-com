import { useState, useMemo } from "react";
import {
  ACCENT_PRESETS,
  type EditorSettings,
  type ThemeMode,
  type ViewModeDefault,
  type TabSizeOption,
  type AccentColorPreset,
} from "../hooks/useEditorSettings.ts";

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

const KEYBOARD_SHORTCUTS: { shortcut: string; macShortcut: string; description: string }[] = [
  { shortcut: "Ctrl + S", macShortcut: "Cmd + S", description: "Save note" },
  { shortcut: "Ctrl + B", macShortcut: "Cmd + B", description: "Bold" },
  { shortcut: "Ctrl + I", macShortcut: "Cmd + I", description: "Italic" },
  { shortcut: "Ctrl + K", macShortcut: "Cmd + K", description: "Focus search" },
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
  onTrashRetentionChange?: (days: number) => void;
  editorSettings: EditorSettings;
  updateEditorSetting: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
}

export function SettingsPage({ onBack, onTrashRetentionChange, editorSettings, updateEditorSetting }: SettingsPageProps) {

  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(() => {
    const stored = localStorage.getItem(TRASH_RETENTION_KEY);
    return stored !== null ? Number(stored) : 30;
  });

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
