import { useEffect } from "react";
import { useRegistry } from "./CommandContext.tsx";

/**
 * Global keyboard shortcut dispatcher. Mount once at the app level.
 * Listens for keydown events and dispatches to the command registry.
 * Skips editor-scoped commands (CodeMirror handles those).
 */
export function useShortcuts() {
  const registry = useRegistry();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if an input/textarea/select is focused (unless it's CodeMirror)
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }

      registry.executeBinding(e);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [registry]);
}
