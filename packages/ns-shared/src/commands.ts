/** Command scope determines where a shortcut is active. */
export type CommandScope = "global" | "editor" | "sidebar";

/** Key binding specification. Uses CodeMirror notation (Mod-s, Mod-Shift-d). */
export interface ShortcutBinding {
  key: string;
  /** Override for Mac if different from key */
  mac?: string;
}

/** A command definition — describes what the command does and its default shortcut. */
export interface CommandDefinition {
  /** Unique identifier, e.g. "note:save", "palette:open" */
  id: string;
  /** Human-readable label, e.g. "Save Note" */
  label: string;
  /** Grouping category for palette display */
  category: "Note" | "Editor" | "Navigation" | "AI" | "View" | "Sidebar" | "Drawer";
  /** Where the shortcut is active */
  scope: CommandScope;
  /** Default key binding, or null for palette-only commands */
  defaultBinding: ShortcutBinding | null;
  /** Only available on desktop (Tauri) */
  desktopOnly?: boolean;
}

/** Handler function for a command. Return true to indicate handled. */
export type CommandHandler = () => boolean | void;
