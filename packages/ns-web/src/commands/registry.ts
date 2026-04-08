import type { CommandDefinition, CommandHandler } from "@derekentringer/ns-shared";

/** All default commands for NoteSync. */
export const DEFAULT_COMMANDS: CommandDefinition[] = [
  // Core
  { id: "palette:open", label: "Command Palette", category: "Navigation", scope: "global", defaultBinding: { key: "Mod-p" } },
  { id: "switcher:open", label: "Quick Switcher", category: "Navigation", scope: "global", defaultBinding: { key: "Mod-o" } },

  // Note
  { id: "note:new", label: "New Note", category: "Note", scope: "global", defaultBinding: { key: "Mod-n" } },
  { id: "note:save", label: "Save Note", category: "Note", scope: "global", defaultBinding: { key: "Mod-s" } },
  { id: "note:delete", label: "Delete Note", category: "Note", scope: "global", defaultBinding: null },
  { id: "note:export-md", label: "Export as Markdown", category: "Note", scope: "global", defaultBinding: null },

  // View & Navigation
  { id: "view:cycle-mode", label: "Cycle View Mode", category: "View", scope: "global", defaultBinding: { key: "Mod-e" } },
  { id: "view:focus-mode", label: "Toggle Focus Mode", category: "View", scope: "global", defaultBinding: { key: "Mod-Shift-d" } },
  { id: "nav:settings", label: "Open Settings", category: "Navigation", scope: "global", defaultBinding: { key: "Mod-," } },
  { id: "nav:search", label: "Focus Search", category: "Navigation", scope: "global", defaultBinding: { key: "Mod-k" } },

  // Sidebar & Panels
  { id: "sidebar:toggle", label: "Toggle Sidebar", category: "Sidebar", scope: "global", defaultBinding: { key: "Mod-\\" } },
  { id: "notelist:toggle", label: "Toggle Note List", category: "Sidebar", scope: "global", defaultBinding: { key: "Mod-Shift-\\" } },
  { id: "sidebar:explorer", label: "Explorer Tab", category: "Sidebar", scope: "global", defaultBinding: { key: "Mod-1" } },
  { id: "sidebar:search", label: "Search Tab", category: "Sidebar", scope: "global", defaultBinding: { key: "Mod-2" } },
  { id: "sidebar:favorites", label: "Favorites Tab", category: "Sidebar", scope: "global", defaultBinding: { key: "Mod-3" } },
  { id: "sidebar:tags", label: "Tags Tab", category: "Sidebar", scope: "global", defaultBinding: { key: "Mod-4" } },

  // Drawer
  { id: "drawer:assistant", label: "Toggle AI Assistant", category: "Drawer", scope: "global", defaultBinding: { key: "Mod-Alt-a" } },
  { id: "drawer:history", label: "Toggle Version History", category: "Drawer", scope: "global", defaultBinding: { key: "Mod-Alt-h" } },
  { id: "drawer:toc", label: "Toggle Table of Contents", category: "Drawer", scope: "global", defaultBinding: { key: "Mod-Alt-t" } },

  // Tab Navigation
  { id: "tab:close", label: "Close Tab", category: "Navigation", scope: "global", defaultBinding: { key: "Mod-w" }, desktopOnly: true },
  { id: "tab:prev", label: "Previous Tab", category: "Navigation", scope: "global", defaultBinding: null },
  { id: "tab:next", label: "Next Tab", category: "Navigation", scope: "global", defaultBinding: null },

  // Editor Formatting
  { id: "editor:bold", label: "Bold", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-b" } },
  { id: "editor:italic", label: "Italic", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-i" } },
  { id: "editor:strikethrough", label: "Strikethrough", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-Shift-x" } },
  { id: "editor:code", label: "Inline Code", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-Shift-c" } },
  { id: "editor:heading", label: "Cycle Heading", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-Shift-h" } },
  { id: "editor:link", label: "Insert Link", category: "Editor", scope: "editor", defaultBinding: null },
  { id: "editor:wiki-link", label: "Insert Wiki-Link", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-Shift-k" } },
  { id: "editor:toggle-checkbox", label: "Toggle Checkbox", category: "Editor", scope: "editor", defaultBinding: { key: "Mod-Enter" } },

  // AI
  { id: "ai:continue-writing", label: "Continue Writing", category: "AI", scope: "editor", defaultBinding: { key: "Mod-Shift-Space" } },
  { id: "ai:rewrite", label: "AI Rewrite", category: "AI", scope: "editor", defaultBinding: { key: "Mod-Shift-r" } },
];

/**
 * Central command registry. Holds command definitions and active handlers.
 * Singleton — one instance per app, wrapped in React context for component access.
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  private handlers = new Map<string, CommandHandler>();
  private bindingIndex = new Map<string, string>(); // normalized key → command id

  constructor(definitions: CommandDefinition[] = DEFAULT_COMMANDS) {
    for (const def of definitions) {
      this.commands.set(def.id, def);
      if (def.defaultBinding) {
        this.bindingIndex.set(this.normalizeKey(def.defaultBinding.key), def.id);
      }
    }
  }

  /** Register a handler for a command. Returns unregister function. */
  register(id: string, handler: CommandHandler): () => void {
    this.handlers.set(id, handler);
    return () => { this.handlers.delete(id); };
  }

  /** Execute a command by id. Returns true if handled. */
  execute(id: string): boolean {
    const handler = this.handlers.get(id);
    if (!handler) return false;
    const result = handler();
    return result !== false;
  }

  /** Find and execute the command bound to a keyboard event. */
  executeBinding(e: KeyboardEvent): boolean {
    const key = this.eventToKey(e);
    const id = this.bindingIndex.get(key);
    if (!id) return false;
    const def = this.commands.get(id);
    if (!def) return false;
    // Skip editor-scoped commands — CodeMirror handles those
    if (def.scope === "editor") return false;
    if (this.execute(id)) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  /** Get all command definitions. */
  getAllCommands(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  /** Get a command definition by id. */
  getCommand(id: string): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  /** Convert a KeyboardEvent to a normalized key string. */
  private eventToKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("mod");
    if (e.shiftKey) parts.push("shift");
    if (e.altKey) parts.push("alt");
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    parts.push(key);
    return parts.join("-");
  }

  /** Normalize a CodeMirror-style key string (e.g. "Mod-Shift-x") for lookup. */
  private normalizeKey(key: string): string {
    return key
      .split("-")
      .map((p) => p.toLowerCase())
      .sort((a, b) => {
        const order = ["mod", "shift", "alt"];
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return 0;
      })
      .join("-");
  }
}
