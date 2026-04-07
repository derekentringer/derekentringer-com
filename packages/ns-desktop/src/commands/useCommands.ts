import { useEffect } from "react";
import type { CommandHandler } from "@derekentringer/ns-shared";
import { useRegistry } from "./CommandContext.tsx";

/**
 * Register command handlers. Automatically unregisters on unmount.
 * Pass a record of command id → handler.
 *
 * Example:
 * ```
 * useCommands({
 *   "note:save": () => handleSave(),
 *   "note:new": () => handleCreate(),
 * });
 * ```
 */
export function useCommands(handlers: Record<string, CommandHandler>) {
  const registry = useRegistry();

  useEffect(() => {
    const unregisters: (() => void)[] = [];
    for (const [id, handler] of Object.entries(handlers)) {
      unregisters.push(registry.register(id, handler));
    }
    return () => { unregisters.forEach((u) => u()); };
    // Re-register when handler identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, ...Object.values(handlers)]);
}
