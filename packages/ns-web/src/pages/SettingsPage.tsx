import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAiSettings, type CompletionStyle } from "../hooks/useAiSettings.ts";

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer">
      <span className="text-sm text-foreground">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-border"
        }`}
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

const TOGGLE_SETTINGS: { key: "completions" | "summarize" | "tagSuggestions" | "rewrite"; label: string }[] = [
  { key: "completions", label: "Inline completions" },
  { key: "summarize", label: "Summarize" },
  { key: "tagSuggestions", label: "Auto-tag suggestions" },
  { key: "rewrite", label: "Select-and-rewrite" },
];

const STYLE_OPTIONS: { value: CompletionStyle; label: string }[] = [
  { value: "continue", label: "Continue writing" },
  { value: "markdown", label: "Markdown assist" },
  { value: "brief", label: "Brief" },
];

const KEYBOARD_SHORTCUTS: { shortcut: string; macShortcut: string; description: string }[] = [
  { shortcut: "Ctrl + S", macShortcut: "Cmd + S", description: "Save note" },
  { shortcut: "Ctrl + B", macShortcut: "Cmd + B", description: "Bold" },
  { shortcut: "Ctrl + I", macShortcut: "Cmd + I", description: "Italic" },
  { shortcut: "Ctrl + Shift + R", macShortcut: "Cmd + Shift + R", description: "AI Rewrite (with selection)" },
  { shortcut: "Right-click", macShortcut: "Right-click", description: "AI Rewrite (with selection)" },
  { shortcut: "Tab", macShortcut: "Tab", description: "Accept AI completion" },
  { shortcut: "Escape", macShortcut: "Escape", description: "Dismiss AI completion / rewrite menu" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useAiSettings();

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-md p-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
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
          Back to notes
        </button>

        <h1 className="text-xl font-semibold text-foreground mb-6">Settings</h1>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            AI Features
          </h2>

          <div className="divide-y divide-border">
            {TOGGLE_SETTINGS.map(({ key, label }) => (
              <div key={key}>
                <ToggleSwitch
                  label={label}
                  checked={settings[key]}
                  onChange={(value) => updateSetting(key, value)}
                />
                {key === "completions" && settings.completions && (
                  <div className="pb-3 pl-1" role="radiogroup" aria-label="Completion style">
                    {STYLE_OPTIONS.map(({ value, label: styleLabel }) => (
                      <label key={value} className="flex items-center gap-2 py-1 cursor-pointer">
                        <input
                          type="radio"
                          name="completionStyle"
                          value={value}
                          checked={settings.completionStyle === value}
                          onChange={() => updateSetting("completionStyle", value)}
                          className="accent-primary"
                        />
                        <span className="text-sm text-muted-foreground">{styleLabel}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 mt-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Keyboard Shortcuts
          </h2>
          <div className="space-y-2">
            {KEYBOARD_SHORTCUTS.map(({ shortcut, macShortcut, description }) => (
              <div key={`${shortcut}-${description}`} className="flex items-center justify-between py-1">
                <span className="text-sm text-foreground">{description}</span>
                <kbd className="px-2 py-0.5 rounded bg-background border border-border text-xs text-muted-foreground font-mono">
                  {isMac ? macShortcut : shortcut}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
