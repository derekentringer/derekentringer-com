import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { CommandRegistry } from "./registry.ts";

const CommandCtx = createContext<CommandRegistry | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef(new CommandRegistry());

  // Global keyboard shortcut dispatcher
  useEffect(() => {
    const registry = registryRef.current;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inEditableField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      // Bare-key shortcuts (no Cmd/Ctrl/Alt) shouldn't steal keystrokes
      // while the user is typing — but modifier combos like Cmd+J,
      // Cmd+P, Cmd+S clearly express global intent and should fire
      // from any focus context. Filtering them out blocks Cmd+J in
      // the Filter folders box, which is the bug we just hit.
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
      if (inEditableField && !hasModifier) return;
      registry.executeBinding(e);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CommandCtx.Provider value={registryRef.current}>
      {children}
    </CommandCtx.Provider>
  );
}

export function useRegistry(): CommandRegistry {
  const registry = useContext(CommandCtx);
  if (!registry) throw new Error("useRegistry must be used within <CommandProvider>");
  return registry;
}
