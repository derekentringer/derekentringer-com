import { useNavigate } from "react-router-dom";
import { useAiSettings, type AiSettings } from "../hooks/useAiSettings.ts";

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

const SETTING_LABELS: Record<keyof AiSettings, string> = {
  completions: "Inline completions",
  summarize: "Summarize",
  tagSuggestions: "Auto-tag suggestions",
};

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useAiSettings();

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
            {(Object.keys(SETTING_LABELS) as (keyof AiSettings)[]).map(
              (key) => (
                <ToggleSwitch
                  key={key}
                  label={SETTING_LABELS[key]}
                  checked={settings[key]}
                  onChange={(value) => updateSetting(key, value)}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
