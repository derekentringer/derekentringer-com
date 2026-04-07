import { createContext, useContext, useRef, type ReactNode } from "react";
import { CommandRegistry } from "./registry.ts";

const CommandCtx = createContext<CommandRegistry | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef(new CommandRegistry());
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
