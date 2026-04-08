import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRegistry } from "./CommandContext.tsx";

/** Map menu item IDs (from Rust) to command registry IDs */
const MENU_TO_COMMAND: Record<string, string> = {
  // File
  "new-note": "note:new",
  "quick-switcher": "switcher:open",
  "close-tab": "tab:close",
  "save": "note:save",
  "export-md": "note:export-md",
  "import-files": "import:files",
  "import-folder": "import:folder",
  "settings": "nav:settings",

  // Edit
  "find": "nav:search",
  "bold": "editor:bold",
  "italic": "editor:italic",
  "strikethrough": "editor:strikethrough",
  "inline-code": "editor:code",
  "heading": "editor:heading",

  // View
  "view-editor": "view:set-editor",
  "view-split": "view:set-split",
  "view-live": "view:set-live",
  "view-preview": "view:set-preview",
  "cycle-view": "view:cycle-mode",
  "toggle-sidebar": "sidebar:toggle",
  "toggle-notelist": "notelist:toggle",
  "focus-mode": "view:focus-mode",
  "command-palette": "palette:open",

  // Window
  "prev-tab": "tab:prev",
  "next-tab": "tab:next",

  // Help
  "keyboard-shortcuts": "nav:shortcuts",
  "about": "app:about",
};

/**
 * Listen for native menu events from Tauri and dispatch to the command registry.
 * Mount once inside CommandProvider.
 */
export function useMenuEvents() {
  const registry = useRegistry();

  useEffect(() => {
    // Guard: listen() requires the Tauri runtime (not available in tests)
    if (typeof window === "undefined" || !(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return;

    const unlisten = listen<string>("menu-event", (event) => {
      const commandId = MENU_TO_COMMAND[event.payload];
      if (commandId) {
        registry.execute(commandId);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [registry]);
}
