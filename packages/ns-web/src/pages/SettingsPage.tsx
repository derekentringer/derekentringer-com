declare const __APP_VERSION__: string;

import { useState, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.tsx";
import { useRegistry, formatShortcut } from "../commands/index.ts";
import { useAiSettings, type CompletionStyle } from "../hooks/useAiSettings.ts";
import { useEditorSettings, ACCENT_PRESETS, deriveAccentColors, type ThemeMode, type ViewModeDefault, type TabSizeOption, type CursorStyle, type AccentColorPreset } from "../hooks/useEditorSettings.ts";

import { useOfflineCache } from "../hooks/useOfflineCache.ts";
import { enableEmbeddings, disableEmbeddings, getEmbeddingStatus } from "../api/ai.ts";
import { setupTotp, verifyTotpSetup, disableTotp, getMe } from "../api/auth.ts";

import { getTrashRetention, setTrashRetention, getVersionInterval, setVersionInterval } from "../api/offlineNotes.ts";
import { clearAllCaches, getDB } from "../lib/db.ts";
import { getUsers, resetUserPassword, deleteUser, getApprovedEmails, setApprovedEmails, getAdminAiSettings, setAdminAiSettings, type AdminUser } from "../api/admin.ts";
import type { EmbeddingStatus } from "@derekentringer/shared/ns";
import type { TotpSetupResponse } from "@derekentringer/shared";

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="relative group ml-1.5 inline-flex items-center" aria-label={tooltip}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="pointer-events-none absolute top-full left-0 mt-2 w-56 rounded-md bg-card border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
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
    <label className={`flex items-center justify-between px-3 py-2.5 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
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

/** Grouped rows with subtle border — macOS-style setting group */
function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {children}
    </div>
  );
}

/** A single row inside a SettingsGroup: label left, control right */
function SettingsRow({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm text-foreground flex items-center">
        {label}
        {info && <InfoIcon tooltip={info} />}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {children}
      </div>
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

const STYLE_OPTIONS: { value: CompletionStyle; label: string; info: string }[] = [
  { value: "continue", label: "Continue writing", info: "Predicts and continues your natural writing style." },
  { value: "markdown", label: "Markdown assist", info: "Suggests markdown formatting like headings, lists, and code blocks." },
  { value: "brief", label: "Brief", info: "Short, concise completions — a few words at a time." },
];

// Keyboard shortcuts are now driven by the command registry.
// Commands with no defaultBinding (palette-only) are excluded from display.

const AUTO_SAVE_OPTIONS: { value: number; label: string }[] = [
  { value: 500, label: "500ms" },
  { value: 1000, label: "1s" },
  { value: 1500, label: "1.5s" },
  { value: 2000, label: "2s" },
  { value: 3000, label: "3s" },
  { value: 5000, label: "5s" },
];

const DEBOUNCE_OPTIONS: { value: number; label: string }[] = [
  { value: 200, label: "200ms" },
  { value: 400, label: "400ms" },
  { value: 600, label: "600ms" },
  { value: 800, label: "800ms" },
  { value: 1000, label: "1s" },
  { value: 1500, label: "1.5s" },
];

const MAX_CACHE_OPTIONS: { value: number; label: string }[] = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 200, label: "200" },
  { value: 500, label: "500" },
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

const SECTION_SLUGS: Record<string, string> = {
  "appearance": "Appearance",
  "editor": "Editor",
  "keyboard-shortcuts": "Keyboard Shortcuts",
  "ai-features": "AI Features",
  "offline-cache": "Offline Cache",
  "version-history": "Version History",
  "trash": "Trash",
  "account": "My Account",
  "security": "Security",
  "about": "About",
  "ai-controls": "AI Controls",
  "approved-emails": "Approved Emails",
  "user-management": "User Management",
};

const SLUG_FROM_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTION_SLUGS).map(([slug, section]) => [section, slug]),
);

export function SettingsPage() {
  const navigate = useNavigate();
  const { section: urlSection } = useParams<{ section?: string }>();
  const { user, setUserFromLogin, logout } = useAuth();
  const { settings: aiSettings, updateSetting: updateAiSetting } = useAiSettings();
  const { settings: editorSettings, updateSetting: updateEditorSetting } = useEditorSettings();
  const { lastSyncedAt } = useOfflineCache();
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [cachedNoteCount, setCachedNoteCount] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(30);
  const [versionInterval, setVersionIntervalState] = useState<number>(15);
  const [shortcutFilter, setShortcutFilter] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpSetupCode, setTotpSetupCode] = useState("");
  const [totpSetupError, setTotpSetupError] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisableError, setTotpDisableError] = useState("");
  const [totpShowDisable, setTotpShowDisable] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);

  // Admin state
  const [adminAiEnabled, setAdminAiEnabled] = useState(false);
  const [adminAiLoading, setAdminAiLoading] = useState(false);
  const [approvedEmailsText, setApprovedEmailsText] = useState("");
  const [emailsSaving, setEmailsSaving] = useState(false);
  const [emailsStatus, setEmailsStatus] = useState<"saved" | "error" | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [resetDialog, setResetDialog] = useState<{ userId: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ userId: string; email: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");


  const loadEmbeddingStatus = useCallback(async () => {
    try {
      const status = await getEmbeddingStatus();
      setEmbeddingStatus(status);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (aiSettings.masterAiEnabled && aiSettings.semanticSearch) {
      loadEmbeddingStatus();
      const timer = setInterval(loadEmbeddingStatus, 10_000);
      return () => clearInterval(timer);
    }
  }, [aiSettings.masterAiEnabled, aiSettings.semanticSearch, loadEmbeddingStatus]);


  // Load admin data
  useEffect(() => {
    if (user?.role !== "admin") return;
    async function loadAdminData() {
      setUsersLoading(true);
      try {
        const [usersRes, emailsRes, aiRes] = await Promise.all([
          getUsers(), getApprovedEmails(), getAdminAiSettings(),
        ]);
        setAdminUsers(usersRes);
        setApprovedEmailsText(emailsRes.join("\n"));
        setAdminAiEnabled(aiRes.aiEnabled);
      } catch { /* silent */ }
      finally { setUsersLoading(false); }
    }
    loadAdminData();
  }, [user?.role]);

  // Load trash retention setting
  useEffect(() => {
    getTrashRetention()
      .then((res) => setTrashRetentionDays(res.days))
      .catch(() => {});
    getVersionInterval()
      .then((res) => setVersionIntervalState(res.minutes))
      .catch(() => {});
  }, []);

  // Load cached note count
  useEffect(() => {
    async function loadCount() {
      try {
        const db = await getDB();
        const count = await db.count("notes");
        setCachedNoteCount(count);
      } catch {
        setCachedNoteCount(null);
      }
    }
    loadCount();
  }, [clearingCache]);

  async function handleSemanticSearchToggle(enabled: boolean) {
    updateAiSetting("semanticSearch", enabled);
    if (!enabled) {
      updateAiSetting("qaAssistant", false);
    }
    try {
      if (enabled) {
        await enableEmbeddings();
        loadEmbeddingStatus();
      } else {
        await disableEmbeddings();
        setEmbeddingStatus(null);
      }
    } catch {
      // Revert on failure
      updateAiSetting("semanticSearch", !enabled);
    }
  }

  async function handleTrashRetentionChange(days: number) {
    setTrashRetentionDays(days);
    try {
      await setTrashRetention(days);
    } catch {
      // Revert on failure
      setTrashRetentionDays(trashRetentionDays);
    }
  }

  async function handleVersionIntervalChange(minutes: number) {
    setVersionIntervalState(minutes);
    try {
      await setVersionInterval(minutes);
    } catch {
      setVersionIntervalState(versionInterval);
    }
  }

  async function handleClearCache() {
    setClearingCache(true);
    try {
      await clearAllCaches();
      setCachedNoteCount(0);
      setConfirmClear(false);
    } catch {
      // Silent fail
    } finally {
      setClearingCache(false);
    }
  }

  function handleThemeChange(theme: ThemeMode) {
    updateEditorSetting("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "teams") {
      // Teams theme has its own brand colors — clear any accent overrides
      document.documentElement.style.removeProperty("--color-primary");
      document.documentElement.style.removeProperty("--color-primary-hover");
      document.documentElement.style.removeProperty("--color-ring");
      document.documentElement.style.removeProperty("--color-primary-contrast");
      refreshFavicon();
    } else {
      const isLight = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
      const colors = editorSettings.accentColor === "custom"
        ? deriveAccentColors(editorSettings.customAccentColor)
        : ACCENT_PRESETS[editorSettings.accentColor];
      document.documentElement.style.setProperty("--color-primary", isLight ? colors.light : colors.dark);
      document.documentElement.style.setProperty("--color-primary-hover", isLight ? colors.lightHover : colors.darkHover);
      document.documentElement.style.setProperty("--color-ring", isLight ? colors.light : colors.dark);
      document.documentElement.style.setProperty("--color-primary-contrast", editorSettings.accentColor === "black" ? "#ffffff" : "#000000");
    }
  }

  function refreshFavicon() {
    requestAnimationFrame(() => {
      const s = getComputedStyle(document.documentElement);
      const p = s.getPropertyValue("--color-primary").trim() || "#d4e157";
      const c = s.getPropertyValue("--color-primary-contrast").trim() || "#000";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${p}"/><rect x="228" y="128" width="56" height="256" rx="28" fill="${c}"/><rect x="128" y="228" width="256" height="56" rx="28" fill="${c}"/></svg>`;
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
      if (!link) { link = document.createElement("link"); link.rel = "icon"; link.type = "image/svg+xml"; document.head.appendChild(link); }
      link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    });
  }

  function applyAccentColors(colors: { dark: string; light: string; darkHover: string; lightHover: string }, contrastColor: string) {
    const theme = editorSettings.theme;
    const isLight = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.style.setProperty("--color-primary", isLight ? colors.light : colors.dark);
    document.documentElement.style.setProperty("--color-primary-hover", isLight ? colors.lightHover : colors.darkHover);
    document.documentElement.style.setProperty("--color-ring", isLight ? colors.light : colors.dark);
    document.documentElement.style.setProperty("--color-primary-contrast", contrastColor);
    refreshFavicon();
  }

  function handleAccentColorChange(preset: AccentColorPreset) {
    updateEditorSetting("accentColor", preset);
    if (preset === "custom") {
      applyAccentColors(deriveAccentColors(editorSettings.customAccentColor), "#000000");
    } else {
      applyAccentColors(ACCENT_PRESETS[preset], preset === "black" ? "#ffffff" : "#000000");
    }
  }

  async function handleAdminAiToggle(enabled: boolean) {
    setAdminAiLoading(true);
    try {
      await setAdminAiSettings(enabled);
      setAdminAiEnabled(enabled);
    } catch { setAdminAiEnabled(!enabled); }
    finally { setAdminAiLoading(false); }
  }

  async function handleSaveEmails() {
    setEmailsSaving(true);
    setEmailsStatus(null);
    try {
      const emails = approvedEmailsText.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
      await setApprovedEmails(emails);
      setEmailsStatus("saved");
      setTimeout(() => setEmailsStatus(null), 2000);
    } catch { setEmailsStatus("error"); setTimeout(() => setEmailsStatus(null), 2000); }
    finally { setEmailsSaving(false); }
  }

  async function handleResetUserPassword() {
    if (!resetDialog || !resetPassword) return;
    setResetError("");
    try {
      await resetUserPassword(resetDialog.userId, resetPassword);
      setResetDialog(null);
      setResetPassword("");
    } catch (err) { setResetError(err instanceof Error ? err.message : "Failed"); }
  }

  async function handleDeleteUser() {
    if (!deleteDialog) return;
    setDeleteError("");
    try {
      await deleteUser(deleteDialog.userId);
      setAdminUsers(prev => prev.filter(u => u.id !== deleteDialog.userId));
      setDeleteDialog(null);
    } catch (err) { setDeleteError(err instanceof Error ? err.message : "Failed"); }
  }

  function handleCustomAccentColor(hex: string) {
    updateEditorSetting("customAccentColor", hex);
    updateEditorSetting("accentColor", "custom");
    applyAccentColors(deriveAccentColors(hex), "#000000");
  }

  const registry = useRegistry();
  const shortcutCommands = useMemo(
    () => registry.getAllCommands().filter((c) => c.defaultBinding != null),
    [registry],
  );

  const filteredShortcuts = useMemo(() => {
    if (!shortcutFilter.trim()) return shortcutCommands;
    const q = shortcutFilter.toLowerCase();
    return shortcutCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      formatShortcut(cmd.defaultBinding).toLowerCase().includes(q)
    );
  }, [shortcutCommands, shortcutFilter]);

  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );

  const aiDisabled = !aiSettings.masterAiEnabled;

  const SECTIONS = [
    "Appearance",
    "Editor",
    "Keyboard Shortcuts",
    "AI Features",
    "Offline Cache",
    "Version History",
    "Trash",
    "My Account",
    "Security",
    "About",
    "AI Controls",
    "Approved Emails",
    "User Management",
  ] as const;
  type Section = typeof SECTIONS[number];
  const initialSection = (urlSection && SECTION_SLUGS[urlSection] as Section) || "Appearance";
  const [activeSection, setActiveSectionState] = useState<Section>(initialSection);

  function setActiveSection(section: Section) {
    setActiveSectionState(section);
    const slug = SLUG_FROM_SECTION[section] || "appearance";
    navigate(`/settings/${slug}`, { replace: true });
  }

  function formatLastSynced(): string {
    if (!lastSyncedAt) return "Never";
    const diff = Date.now() - lastSyncedAt.getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 minute ago";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "1 hour ago";
    return `${hours} hours ago`;
  }

  return (
    <div className="flex h-full bg-background">
      {/* Left sidebar navigation */}
      <nav className="w-48 shrink-0 border-r border-border flex flex-col bg-sidebar overflow-y-auto">
        <div className="px-4 py-4 flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>
        </div>
        <div className="flex flex-col px-2">
          {([
            { label: "General", items: ["Appearance", "Editor", "Keyboard Shortcuts"] },
            { label: "Features", items: ["AI Features", "Offline Cache"] },
            { label: "Data", items: ["Version History", "Trash"] },
            { label: "Account", items: ["My Account", "Security"] },
            { label: "App", items: ["About"] },
            ...(user?.role === "admin" ? [{ label: "Admin", items: ["AI Controls", "Approved Emails", "User Management"] as Section[] }] : []),
          ] as { label: string | null; items: Section[] }[]).map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3" : ""}>
              {group.label && (
                <div className="px-3 pb-1 mb-0.5 border-b border-border">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((section) => (
                  <button
                    key={section}
                    onClick={() => setActiveSection(section)}
                    className={`text-left px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                      activeSection === section
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    {section}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Right content area */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl">
          {/* Appearance */}
          {activeSection === "Appearance" && (
          <div className="space-y-4">
            <SettingsGroup>
              <SettingsRow label="Theme">
                <div className="flex gap-3" role="radiogroup" aria-label="Theme">
                  <RadioOption name="theme" value={"dark" as ThemeMode} currentValue={editorSettings.theme} label="Dark" onChange={handleThemeChange} />
                  <RadioOption name="theme" value={"light" as ThemeMode} currentValue={editorSettings.theme} label="Light" onChange={handleThemeChange} />
                  <RadioOption name="theme" value={"system" as ThemeMode} currentValue={editorSettings.theme} label="System" onChange={handleThemeChange} />
                  <RadioOption name="theme" value={"teams" as ThemeMode} currentValue={editorSettings.theme} label="Teams" onChange={handleThemeChange} />
                </div>
              </SettingsRow>
              <SettingsRow label="Accent color">
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent color">
                  {(Object.keys(ACCENT_PRESETS) as Exclude<AccentColorPreset, "custom">[]).map((preset) => (
                    <button
                      key={preset}
                      role="radio"
                      aria-checked={editorSettings.accentColor === preset}
                      aria-label={preset}
                      onClick={() => handleAccentColorChange(preset)}
                      className="relative w-6 h-6 rounded-full border-2 transition-all cursor-pointer"
                      style={{
                        backgroundColor: ACCENT_PRESETS[preset].dark,
                        borderColor: editorSettings.accentColor === preset ? "var(--color-foreground)" : "transparent",
                      }}
                    >
                      {editorSettings.accentColor === preset && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={preset === "white" || preset === "amber" ? "#000" : "#fff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 w-3 h-3 m-auto">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <label
                    className="relative w-6 h-6 rounded-full border-2 transition-all cursor-pointer overflow-hidden"
                    style={{
                      backgroundColor: editorSettings.customAccentColor,
                      borderColor: editorSettings.accentColor === "custom" ? "var(--color-foreground)" : "transparent",
                    }}
                    title="Custom color"
                  >
                    <input
                      type="color"
                      value={editorSettings.customAccentColor}
                      onChange={(e) => handleCustomAccentColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {editorSettings.accentColor === "custom" && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 w-3 h-3 m-auto pointer-events-none">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </label>
                </div>
              </SettingsRow>
              <SettingsRow label="Editor font size">
                <select
                  value={editorSettings.editorFontSize}
                  onChange={(e) => updateEditorSetting("editorFontSize", Number(e.target.value))}
                  className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Editor font size"
                >
                  {Array.from({ length: 15 }, (_, i) => i + 10).map((size) => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </SettingsRow>
            </SettingsGroup>
          </div>
          )}

          {/* Editor Preferences */}
          {activeSection === "Editor" && (
          <div className="space-y-4">
            <SettingsGroup>
              <SettingsRow label="Default view mode">
                <div className="flex gap-3" role="radiogroup" aria-label="Default view mode">
                  <RadioOption name="defaultViewMode" value={"editor" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Editor" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                  <RadioOption name="defaultViewMode" value={"live" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Live" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                  <RadioOption name="defaultViewMode" value={"split" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Split" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                  <RadioOption name="defaultViewMode" value={"preview" as ViewModeDefault} currentValue={editorSettings.defaultViewMode} label="Preview" onChange={(v) => updateEditorSetting("defaultViewMode", v)} />
                </div>
              </SettingsRow>
              <SettingsRow label="Auto-save delay">
                <select
                  value={editorSettings.autoSaveDelay}
                  onChange={(e) => updateEditorSetting("autoSaveDelay", Number(e.target.value))}
                  className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Auto-save delay"
                >
                  {AUTO_SAVE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </SettingsRow>
              <SettingsRow label="Tab size">
                <div className="flex gap-3" role="radiogroup" aria-label="Tab size">
                  <RadioOption name="tabSize" value={2 as TabSizeOption} currentValue={editorSettings.tabSize} label="2 spaces" onChange={(v) => updateEditorSetting("tabSize", v)} />
                  <RadioOption name="tabSize" value={4 as TabSizeOption} currentValue={editorSettings.tabSize} label="4 spaces" onChange={(v) => updateEditorSetting("tabSize", v)} />
                </div>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup>
              <ToggleSwitch label="Line numbers" checked={editorSettings.showLineNumbers} onChange={(v) => updateEditorSetting("showLineNumbers", v)} info="Show line numbers in the editor gutter." />
              <ToggleSwitch label="Word wrap" checked={editorSettings.wordWrap} onChange={(v) => updateEditorSetting("wordWrap", v)} info="Wrap long lines instead of horizontal scrolling." />
              <ToggleSwitch label="Cursor blink" checked={editorSettings.cursorBlink} onChange={(v) => updateEditorSetting("cursorBlink", v)} info="Animate the cursor with a blinking effect." />
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow label="Cursor style">
                <div className="flex gap-3" role="radiogroup" aria-label="Cursor style">
                  <RadioOption name="cursorStyle" value={"line" as CursorStyle} currentValue={editorSettings.cursorStyle} label="Line" onChange={(v) => updateEditorSetting("cursorStyle", v)} />
                  <RadioOption name="cursorStyle" value={"block" as CursorStyle} currentValue={editorSettings.cursorStyle} label="Block" onChange={(v) => updateEditorSetting("cursorStyle", v)} />
                  <RadioOption name="cursorStyle" value={"underline" as CursorStyle} currentValue={editorSettings.cursorStyle} label="Underline" onChange={(v) => updateEditorSetting("cursorStyle", v)} />
                </div>
              </SettingsRow>
            </SettingsGroup>
          </div>
          )}

          {/* AI Features */}
          {activeSection === "AI Features" && (
          <div className="space-y-4">
            <SettingsGroup>
              <ToggleSwitch
                label="Enable AI features"
                checked={aiSettings.masterAiEnabled}
                onChange={(v) => updateAiSetting("masterAiEnabled", v)}
                info="Master toggle for all AI features. When off, all AI features are disabled."
              />
            </SettingsGroup>

            {/* Writing Assistance */}
            <SettingsGroup>
              <ToggleSwitch label="Inline completions" checked={aiSettings.completions} onChange={(v) => updateAiSetting("completions", v)} info="AI suggests text as you type. Press Tab to accept, Escape to dismiss." disabled={aiDisabled} />
              {aiSettings.completions && !aiDisabled && (
                <div className="pb-2.5 px-3 space-y-3">
                  <div role="radiogroup" aria-label="Completion style">
                    {STYLE_OPTIONS.map(({ value, label: styleLabel, info: styleInfo }) => (
                      <label key={value} className="flex items-center gap-2 py-1 cursor-pointer">
                        <input type="radio" name="completionStyle" value={value} checked={aiSettings.completionStyle === value} onChange={() => updateAiSetting("completionStyle", value)} className="accent-primary" aria-label={styleLabel} />
                        <span className="text-sm text-muted-foreground">{styleLabel}</span>
                        <InfoIcon tooltip={styleInfo} />
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Completion delay</label>
                    <select value={aiSettings.completionDebounceMs} onChange={(e) => updateAiSetting("completionDebounceMs", Number(e.target.value))} className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Completion delay">
                      {DEBOUNCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <ToggleSwitch label="Continue writing" checked={aiSettings.continueWriting} onChange={(v) => updateAiSetting("continueWriting", v)} info="Press Cmd/Ctrl+Shift+Space to generate a full paragraph or suggest document structure." disabled={aiDisabled} />
              <ToggleSwitch label="Select-and-rewrite" checked={aiSettings.rewrite} onChange={(v) => updateAiSetting("rewrite", v)} info="Select text and right-click (or Cmd+Shift+R) to rewrite it with AI." disabled={aiDisabled} />
            </SettingsGroup>

            {/* Note Analysis */}
            <SettingsGroup>
              <ToggleSwitch label="Summarize" checked={aiSettings.summarize} onChange={(v) => updateAiSetting("summarize", v)} info="Generate a short AI summary of your note, shown below the title." disabled={aiDisabled} />
              <ToggleSwitch label="Auto-tag suggestions" checked={aiSettings.tagSuggestions} onChange={(v) => updateAiSetting("tagSuggestions", v)} info="AI analyzes your note content and suggests relevant tags." disabled={aiDisabled} />
            </SettingsGroup>

            {/* Search & Chat */}
            <SettingsGroup>
              <div>
                <ToggleSwitch label="Semantic search" checked={aiSettings.semanticSearch} onChange={(v) => handleSemanticSearchToggle(v)} info="Search by meaning, not just keywords. Uses AI embeddings to find related notes." disabled={aiDisabled} />
                {aiSettings.semanticSearch && !aiDisabled && embeddingStatus && (
                  <div className="pb-2.5 px-3 text-xs text-muted-foreground">
                    {embeddingStatus.pendingCount > 0
                      ? `${embeddingStatus.totalWithEmbeddings} embedded, ${embeddingStatus.pendingCount} pending`
                      : `${embeddingStatus.totalWithEmbeddings} notes embedded`}
                  </div>
                )}
              </div>
              <ToggleSwitch label="AI assistant chat" checked={aiSettings.qaAssistant} onChange={(v) => updateAiSetting("qaAssistant", v)} info="Ask natural language questions about your notes. Requires semantic search to be enabled." disabled={aiDisabled || !aiSettings.semanticSearch} />

              {/* Phase C.5 — per-tool auto-approval for destructive
                  Claude actions. All-off by default; enable sparingly. */}
              {aiSettings.qaAssistant && !aiDisabled && (
                <div className="pt-2 px-3 space-y-1 border-t border-border/50">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Auto-approve destructive actions</span>
                  <p className="text-[11px] text-muted-foreground">When off, Claude must wait for your confirmation before each of these. Enable sparingly.</p>
                  <ToggleSwitch label="Move notes to Trash" checked={aiSettings.autoApprove.deleteNote} onChange={(v) => updateAiSetting("autoApprove", { ...aiSettings.autoApprove, deleteNote: v })} info="Auto-approve `delete_note` calls. Notes go to Trash and can be restored until the trash auto-delete timer purges them." />
                  <ToggleSwitch label="Delete folders" checked={aiSettings.autoApprove.deleteFolder} onChange={(v) => updateAiSetting("autoApprove", { ...aiSettings.autoApprove, deleteFolder: v })} info="Auto-approve `delete_folder`. Notes inside become Unfiled; the notes themselves aren't deleted." />
                  <ToggleSwitch label="Rewrite note content" checked={aiSettings.autoApprove.updateNoteContent} onChange={(v) => updateAiSetting("autoApprove", { ...aiSettings.autoApprove, updateNoteContent: v })} info="Auto-approve `update_note_content`. Previous version stays in version history." />
                  <ToggleSwitch label="Rename notes" checked={aiSettings.autoApprove.renameNote} onChange={(v) => updateAiSetting("autoApprove", { ...aiSettings.autoApprove, renameNote: v })} info="Auto-approve `rename_note`. Updates the note title only; content, folder, tags, and id are unchanged." />
                  <ToggleSwitch label="Rename folders" checked={aiSettings.autoApprove.renameFolder} onChange={(v) => updateAiSetting("autoApprove", { ...aiSettings.autoApprove, renameFolder: v })} info="Auto-approve `rename_folder`." />
                  <ToggleSwitch label="Rename tags" checked={aiSettings.autoApprove.renameTag} onChange={(v) => updateAiSetting("autoApprove", { ...aiSettings.autoApprove, renameTag: v })} info="Auto-approve `rename_tag`. Affects every note using that tag." />
                </div>
              )}
            </SettingsGroup>

            {/* Audio */}
            <SettingsGroup>
              <ToggleSwitch label="Audio notes" checked={aiSettings.audioNotes} onChange={(v) => updateAiSetting("audioNotes", v)} info="Record audio and transcribe it into a note using AI." disabled={aiDisabled} />
            </SettingsGroup>
          </div>
          )}

          {/* Offline Cache */}
          {activeSection === "Offline Cache" && (
          <div className="space-y-4">
            <SettingsGroup>
              <SettingsRow label="Cached notes" info="Notes stored locally in IndexedDB for offline access.">
                <span className="text-sm text-muted-foreground" data-testid="cached-note-count">
                  {cachedNoteCount !== null ? cachedNoteCount : "..."}
                </span>
              </SettingsRow>
              <SettingsRow label="Max cached notes" info="Maximum number of notes to keep in the local cache. Oldest notes are evicted when this limit is exceeded.">
                <select
                  value={editorSettings.maxCachedNotes}
                  onChange={(e) => updateEditorSetting("maxCachedNotes", Number(e.target.value))}
                  className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Max cached notes"
                >
                  {MAX_CACHE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </SettingsRow>
              <SettingsRow label="Last synced" info="When your offline edits were last synced with the server.">
                <span className="text-sm text-muted-foreground">{formatLastSynced()}</span>
              </SettingsRow>
            </SettingsGroup>

            <div className="px-1">
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Clear all cached data?</span>
                  <button onClick={handleClearCache} disabled={clearingCache} className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm hover:bg-destructive-hover transition-colors disabled:opacity-50 cursor-pointer">
                    {clearingCache ? "Clearing..." : "Confirm"}
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer">
                  Clear Cache
                </button>
              )}
            </div>
          </div>
          )}

          {/* Trash */}
          {activeSection === "Trash" && (
          <SettingsGroup>
            <SettingsRow label="Auto-delete after" info="Trashed notes are permanently deleted after this period. Set to 'Never' to keep trashed notes indefinitely.">
              <select
                value={trashRetentionDays}
                onChange={(e) => handleTrashRetentionChange(Number(e.target.value))}
                className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Trash retention period"
              >
                {TRASH_RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </SettingsRow>
          </SettingsGroup>
          )}

          {/* Version History */}
          {activeSection === "Version History" && (
          <SettingsGroup>
            <SettingsRow label="Capture interval" info="How often a version snapshot is saved when you edit a note. Set to 'Every save' to capture a version on every save.">
              <select
                value={versionInterval}
                onChange={(e) => handleVersionIntervalChange(Number(e.target.value))}
                className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Version capture interval"
              >
                {VERSION_INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </SettingsRow>
          </SettingsGroup>
          )}

          {/* Account */}
          {activeSection === "My Account" && (
          <div className="space-y-4">
            <SettingsGroup>
              <SettingsRow label="Password">
                <button
                  onClick={() => navigate("/change-password")}
                  className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
                >
                  Change
                </button>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow label="Reset all settings" info="Resets all appearance, editor, and AI settings back to their defaults. Your notes, account, and data are not affected.">
                {confirmReset ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        localStorage.removeItem("ns-editor-settings");
                        localStorage.removeItem("ns-ai-settings");
                        window.location.reload();
                      }}
                      className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm font-medium hover:bg-destructive-hover transition-colors cursor-pointer"
                    >
                      Confirm Reset
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
                  >
                    Reset to Defaults
                  </button>
                )}
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow label="Sign out of your account">
                {confirmSignOut ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={logout}
                      className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm font-medium hover:bg-destructive-hover transition-colors cursor-pointer"
                    >
                      Confirm Sign Out
                    </button>
                    <button
                      onClick={() => setConfirmSignOut(false)}
                      className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmSignOut(true)}
                    className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                )}
              </SettingsRow>
            </SettingsGroup>
          </div>
          )}

          {/* Two-Factor Authentication */}
          {activeSection === "Security" && (
          <div className="space-y-4">
            {totpBackupCodes ? (
              <SettingsGroup>
                <div className="px-3 py-3 space-y-3">
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
                      onClick={() => navigator.clipboard.writeText(totpBackupCodes.join("\n"))}
                      className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover transition-colors cursor-pointer"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setTotpBackupCodes(null)}
                      className="px-3 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </SettingsGroup>
            ) : totpSetup ? (
              <SettingsGroup>
                <div className="px-3 py-3 space-y-3">
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
                      className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {totpLoading ? "Verifying..." : "Verify & Enable"}
                    </button>
                    <button
                      onClick={() => { setTotpSetup(null); setTotpSetupCode(""); setTotpSetupError(""); }}
                      className="px-3 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </SettingsGroup>
            ) : user?.totpEnabled ? (
              <>
                <SettingsGroup>
                  <SettingsRow label="Two-factor authentication">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">Enabled</span>
                  </SettingsRow>
                </SettingsGroup>

                {totpShowDisable ? (
                  <SettingsGroup>
                    <div className="px-3 py-3 space-y-2">
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
                          className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm font-medium hover:bg-destructive-hover disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {totpLoading ? "Disabling..." : "Confirm Disable"}
                        </button>
                        <button
                          onClick={() => { setTotpShowDisable(false); setTotpDisableCode(""); setTotpDisableError(""); }}
                          className="px-3 py-1 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </SettingsGroup>
                ) : (
                  <SettingsGroup>
                    <SettingsRow label="Disable two-factor authentication">
                      <button
                        onClick={() => setTotpShowDisable(true)}
                        className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
                      >
                        Disable 2FA
                      </button>
                    </SettingsRow>
                  </SettingsGroup>
                )}
              </>
            ) : (
              <SettingsGroup>
                <SettingsRow label="Two-factor authentication">
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
                    className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {totpLoading ? "Loading..." : "Enable 2FA"}
                  </button>
                </SettingsRow>
                {totpSetupError && <div className="px-3 pb-2"><p className="text-sm text-error">{totpSetupError}</p></div>}
              </SettingsGroup>
            )}
          </div>
          )}

          {/* Keyboard Shortcuts */}
          {activeSection === "Keyboard Shortcuts" && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Filter shortcuts..."
              value={shortcutFilter}
              onChange={(e) => setShortcutFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground"
            />
            <SettingsGroup>
              {filteredShortcuts.length > 0 ? filteredShortcuts.map((cmd) => (
                <div key={cmd.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-foreground">{cmd.label}</span>
                  <kbd className="px-2 py-0.5 rounded bg-background border border-border text-xs text-muted-foreground font-mono whitespace-nowrap ml-3">
                    {formatShortcut(cmd.defaultBinding)}
                  </kbd>
                </div>
              )) : (
                <div className="px-3 py-3 text-sm text-muted-foreground">No shortcuts found.</div>
              )}
            </SettingsGroup>
          </div>
          )}

          {/* About */}
          {activeSection === "About" && (
          <>
            <SettingsGroup>
              <SettingsRow label="Version">
                <span className="text-sm text-muted-foreground">{__APP_VERSION__}</span>
              </SettingsRow>
              <SettingsRow label="What's New">
                <button
                  onClick={async () => {
                    if (!releaseNotes) {
                      try {
                        const res = await fetch("/RELEASE_NOTES.md");
                        setReleaseNotes(await res.text());
                      } catch {
                        setReleaseNotes("Failed to load release notes.");
                      }
                    }
                    setShowReleaseNotes(true);
                  }}
                  className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors cursor-pointer"
                >
                  Release Notes
                </button>
              </SettingsRow>
              <SettingsRow label="Feedback">
                <button
                  disabled
                  className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground/50 cursor-not-allowed"
                >
                  Coming Soon
                </button>
              </SettingsRow>
            </SettingsGroup>

            {showReleaseNotes && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80" onClick={() => setShowReleaseNotes(false)}>
                <div className="w-full max-w-lg max-h-[80vh] bg-card border border-border rounded-lg shadow-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <span className="text-sm font-medium text-foreground">Release Notes</span>
                    <button onClick={() => setShowReleaseNotes(false)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">&times;</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 text-sm text-foreground markdown-preview">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{releaseNotes ?? ""}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </>
          )}

          {/* AI Controls (Admin) */}
          {activeSection === "AI Controls" && user?.role === "admin" && (
          <SettingsGroup>
            <ToggleSwitch
              label="Global AI enabled"
              checked={adminAiEnabled}
              onChange={handleAdminAiToggle}
              disabled={adminAiLoading}
              info="When disabled, AI features (completions, summaries, tags, rewrite, transcription, Q&A) are turned off for all users."
            />
          </SettingsGroup>
          )}

          {/* Approved Emails (Admin) */}
          {activeSection === "Approved Emails" && user?.role === "admin" && (
          <div className="space-y-4">
            <SettingsGroup>
              <div className="px-3 py-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  One email per line. Only these emails can register new accounts.
                </p>
                <textarea
                  value={approvedEmailsText}
                  onChange={(e) => setApprovedEmailsText(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  placeholder="user@example.com"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEmails}
                    disabled={emailsSaving}
                    className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {emailsSaving ? "Saving..." : "Save"}
                  </button>
                  {emailsStatus === "saved" && <span className="text-xs text-green-500">Saved</span>}
                  {emailsStatus === "error" && <span className="text-xs text-error">Failed to save</span>}
                </div>
              </div>
            </SettingsGroup>
          </div>
          )}

          {/* User Management (Admin) */}
          {activeSection === "User Management" && user?.role === "admin" && (
          <div className="space-y-4">
            {usersLoading ? (
              <p className="text-sm text-muted-foreground px-1">Loading users...</p>
            ) : (
              <SettingsGroup>
                {/* Table header */}
                <div className="flex items-center px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <span className="flex-1 min-w-0">User</span>
                  <span className="w-16 text-center shrink-0">Role</span>
                  <span className="w-12 text-center shrink-0">2FA</span>
                  <span className="w-52 text-right shrink-0">Actions</span>
                </div>
                {adminUsers.map((u) => (
                  <div key={u.id} className="flex items-center px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground truncate block">{u.email}</span>
                      {u.displayName && <span className="text-xs text-muted-foreground">{u.displayName}</span>}
                    </div>
                    <span className="w-16 text-center shrink-0">
                      {u.role === "admin" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Admin</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">User</span>
                      )}
                    </span>
                    <span className="w-12 text-center shrink-0">
                      {u.totpEnabled ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">On</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </span>
                    <div className="w-52 flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        onClick={() => setResetDialog({ userId: u.id, email: u.email })}
                        className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
                      >
                        Reset Password
                      </button>
                      {u.role !== "admin" && (
                        <button
                          onClick={() => setDeleteDialog({ userId: u.id, email: u.email })}
                          className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {adminUsers.length === 0 && (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No users found.</div>
                )}
              </SettingsGroup>
            )}

            {/* Reset password dialog */}
            {resetDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80" onClick={() => { setResetDialog(null); setResetPassword(""); setResetError(""); }}>
                <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-lg p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-medium text-foreground">Reset password for {resetDialog.email}</p>
                  <input
                    type="password"
                    placeholder="New password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  />
                  {resetError && <p className="text-sm text-error">{resetError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleResetUserPassword}
                      disabled={!resetPassword}
                      className="px-3 py-1 rounded-md bg-primary text-primary-contrast text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => { setResetDialog(null); setResetPassword(""); setResetError(""); }}
                      className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete user dialog */}
            {deleteDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80" onClick={() => { setDeleteDialog(null); setDeleteError(""); }}>
                <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-lg p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-medium text-foreground">Delete user {deleteDialog.email}?</p>
                  <p className="text-xs text-muted-foreground">This action cannot be undone. All user data will be permanently deleted.</p>
                  {deleteError && <p className="text-sm text-error">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteUser}
                      className="px-3 py-1 rounded-md bg-destructive text-foreground text-sm font-medium hover:bg-destructive-hover transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => { setDeleteDialog(null); setDeleteError(""); }}
                      className="px-3 py-1 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
