import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const NOTE_MENU_IDS = ["save", "export-md", "close-tab"];
const EDITOR_MENU_IDS = ["bold", "italic", "strikethrough", "inline-code", "heading"];

/**
 * Sync native menu item enabled state with app state.
 * - Note items enabled when a note is selected
 * - Editor items enabled when the CodeMirror editor is focused
 */
export function useMenuState(hasNote: boolean) {
  // Enable/disable note-level menu items
  useEffect(() => {
    invoke("set_menu_items_enabled", { ids: NOTE_MENU_IDS, enabled: hasNote }).catch(() => {});
  }, [hasNote]);

  // Track editor focus for formatting menu items
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement;
      const isEditor = target.closest(".cm-editor") !== null;
      invoke("set_menu_items_enabled", { ids: EDITOR_MENU_IDS, enabled: isEditor }).catch(() => {});
    }

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);
}
