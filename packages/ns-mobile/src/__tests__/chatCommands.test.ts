// Tests for the mobile slash-command parser + filter (Phase A.3).
// The command implementations themselves rely on local SQLite via
// noteStore — those are exercised through the existing integration
// tests of the underlying helpers and are not re-tested here.

import {
  CHAT_COMMANDS,
  filterCommands,
  parseCommand,
} from "../lib/chatCommands";

describe("parseCommand", () => {
  it("returns null for empty input", () => {
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
  });

  it("returns null for plain prose", () => {
    expect(parseCommand("hello there")).toBeNull();
    expect(parseCommand("what is /etc/hosts")).toBeNull(); // mid-string slash
  });

  it("returns null for unknown command", () => {
    expect(parseCommand("/notarealcommand")).toBeNull();
    expect(parseCommand("/foo bar baz")).toBeNull();
  });

  it("parses a known command with no args", () => {
    const r = parseCommand("/recent");
    expect(r).not.toBeNull();
    expect(r!.command.name).toBe("recent");
    expect(r!.args).toBe("");
  });

  it("parses a known command with args", () => {
    const r = parseCommand("/open Testing Notes");
    expect(r).not.toBeNull();
    expect(r!.command.name).toBe("open");
    expect(r!.args).toBe("Testing Notes");
  });

  it("trims leading whitespace before the slash", () => {
    const r = parseCommand("   /favorites");
    expect(r).not.toBeNull();
    expect(r!.command.name).toBe("favorites");
  });

  it("is case-insensitive on the command name", () => {
    expect(parseCommand("/RECENT")?.command.name).toBe("recent");
    expect(parseCommand("/Favorites")?.command.name).toBe("favorites");
  });

  it("preserves the original casing of args", () => {
    const r = parseCommand("/move My Note to Inbox");
    expect(r).not.toBeNull();
    expect(r!.args).toBe("My Note to Inbox");
  });
});

describe("filterCommands", () => {
  it("returns empty when input doesn't start with /", () => {
    expect(filterCommands("hello")).toEqual([]);
    expect(filterCommands("")).toEqual([]);
  });

  it("returns the full catalog when input is just `/`", () => {
    expect(filterCommands("/").length).toBe(CHAT_COMMANDS.length);
  });

  it("filters by name prefix", () => {
    const matches = filterCommands("/fav");
    expect(matches.map((c) => c.name)).toEqual(["favorites", "favorite"]);
  });

  it("returns empty when no command matches the prefix", () => {
    expect(filterCommands("/zzz")).toEqual([]);
  });

  it("is case-insensitive on the prefix", () => {
    const matches = filterCommands("/REC");
    expect(matches.map((c) => c.name)).toEqual(["recent"]);
  });
});

describe("CHAT_COMMANDS catalog", () => {
  it("has every command with required fields", () => {
    for (const c of CHAT_COMMANDS) {
      expect(c.name).toMatch(/^[a-z]+$/);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.usage.startsWith(`/${c.name}`)).toBe(true);
      expect(typeof c.execute).toBe("function");
    }
  });

  it("has unique command names", () => {
    const names = CHAT_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
