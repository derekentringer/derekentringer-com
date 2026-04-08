// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { CommandRegistry, DEFAULT_COMMANDS } from "../registry.ts";

describe("CommandRegistry", () => {
  it("initializes with default commands", () => {
    const registry = new CommandRegistry();
    const commands = registry.getAllCommands();
    expect(commands.length).toBe(DEFAULT_COMMANDS.length);
    expect(commands.length).toBeGreaterThan(20);
  });

  it("retrieves a command by id", () => {
    const registry = new CommandRegistry();
    const cmd = registry.getCommand("note:save");
    expect(cmd).toBeDefined();
    expect(cmd!.label).toBe("Save Note");
    expect(cmd!.category).toBe("Note");
  });

  it("returns undefined for unknown command", () => {
    const registry = new CommandRegistry();
    expect(registry.getCommand("nonexistent")).toBeUndefined();
  });

  it("registers and executes a handler", () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);
    registry.register("note:save", handler);
    const result = registry.execute("note:save");
    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns false when executing unregistered command", () => {
    const registry = new CommandRegistry();
    expect(registry.execute("note:save")).toBe(false);
  });

  it("unregisters a handler via returned function", () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);
    const unregister = registry.register("note:save", handler);
    unregister();
    expect(registry.execute("note:save")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("executeBinding skips editor-scoped commands", () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);
    registry.register("editor:bold", handler);
    const event = new KeyboardEvent("keydown", { key: "b", metaKey: true });
    const result = registry.executeBinding(event);
    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("executeBinding dispatches global-scoped commands", () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);
    registry.register("note:save", handler);
    const event = new KeyboardEvent("keydown", { key: "s", metaKey: true });
    const result = registry.executeBinding(event);
    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("executeBinding returns false for unbound keys", () => {
    const registry = new CommandRegistry();
    const event = new KeyboardEvent("keydown", { key: "z", metaKey: true });
    expect(registry.executeBinding(event)).toBe(false);
  });

  it("has all expected command categories", () => {
    const registry = new CommandRegistry();
    const categories = new Set(registry.getAllCommands().map((c) => c.category));
    expect(categories).toContain("Note");
    expect(categories).toContain("Editor");
    expect(categories).toContain("Navigation");
    expect(categories).toContain("View");
    expect(categories).toContain("Sidebar");
    expect(categories).toContain("Drawer");
    expect(categories).toContain("AI");
  });
});
