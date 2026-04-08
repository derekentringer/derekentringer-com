import type { ShortcutBinding } from "@derekentringer/ns-shared";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const KEY_SYMBOLS: Record<string, string> = {
  Mod: isMac ? "⌘" : "Ctrl",
  Shift: "⇧",
  Alt: isMac ? "⌥" : "Alt",
  Enter: "↵",
  Escape: "Esc",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  Space: "Space",
  "\\": "\\",
};

/**
 * Format a ShortcutBinding for display.
 * "Mod-Shift-x" → "⌘ ⇧ X" (Mac) or "Ctrl ⇧ X" (Windows)
 */
export function formatShortcut(binding: ShortcutBinding | null): string {
  if (!binding) return "";
  const key = (isMac && binding.mac) ? binding.mac : binding.key;
  return key
    .split("-")
    .map((part) => KEY_SYMBOLS[part] ?? part.toUpperCase())
    .join(" ");
}
