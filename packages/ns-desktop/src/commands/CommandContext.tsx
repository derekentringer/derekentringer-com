import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { CommandRegistry } from "./registry.ts";
import { useMenuEvents } from "./useMenuEvents.ts";

const CommandCtx = createContext<CommandRegistry | null>(null);

function MenuEventDispatcher({ children }: { children: ReactNode }) {
  useMenuEvents();
  return <>{children}</>;
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef(new CommandRegistry());

  // Global keyboard shortcut dispatcher
  useEffect(() => {
    const registry = registryRef.current;
    function handleKeyDown(e: KeyboardEvent) {
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
  }, []);

  return (
    <CommandCtx.Provider value={registryRef.current}>
      <MenuEventDispatcher>{children}</MenuEventDispatcher>
    </CommandCtx.Provider>
  );
}

export function useRegistry(): CommandRegistry {
  const registry = useContext(CommandCtx);
  if (!registry) throw new Error("useRegistry must be used within <CommandProvider>");
  return registry;
}
