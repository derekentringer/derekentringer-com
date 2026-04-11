# 11 — Plugin Testing Framework

**Status:** Planned
**Phase:** 4 — Developer Experience
**Priority:** Low

## Summary

`@notesync/plugin-testing` package provides a mock NoteSync host for unit testing plugins in isolation. Plugin authors install it as a dev dependency.

## Usage

```typescript
import { createMockHost, createMockNote } from "@notesync/plugin-testing";
import MyPlugin from "../src/index";

test("plugin registers search command", () => {
  const host = createMockHost();
  const plugin = new MyPlugin();
  plugin.register(host);

  expect(host.commands.getAll()).toContainEqual(
    expect.objectContaining({ id: "my-plugin.search" })
  );
});

test("plugin hook modifies note before save", async () => {
  const host = createMockHost();
  const plugin = new MyPlugin();
  plugin.register(host);
  await plugin.activate(host);

  const note = createMockNote({ title: "Test", content: "hello" });
  const result = await host.hooks.call("before:note:save", note);
  expect(result.content).toContain("modified");
});

test("plugin AI tool executes correctly", async () => {
  const host = createMockHost({
    vault: {
      notes: [
        createMockNote({ title: "Project Plan", tags: ["work"] }),
        createMockNote({ title: "Meeting Notes", tags: ["meeting"] }),
      ],
    },
  });

  const plugin = new MyPlugin();
  plugin.register(host);

  const tool = host.ai.getTool("my-plugin.custom-tool");
  const result = await tool.execute({ query: "work" }, "user-123", host.vault);
  expect(result.noteCards).toHaveLength(1);
});
```

## Mock Utilities

```typescript
// Create mock host with optional pre-populated data
createMockHost(options?: {
  vault?: { notes?: Note[]; folders?: Folder[]; tags?: Tag[] };
  platform?: "web" | "desktop" | "mobile" | "cli";
  version?: string;
})

// Create mock note with defaults
createMockNote(overrides?: Partial<Note>): Note

// Create mock folder
createMockFolder(overrides?: Partial<Folder>): Folder

// Create mock editor state (for editor extensions)
createMockEditorState(content?: string): EditorState
```

## Tasks

- [ ] Create `packages/ns-plugin-testing/`
- [ ] Implement `createMockHost` with all subsystem mocks
- [ ] Implement `createMockNote`, `createMockFolder`, etc.
- [ ] Mock VaultAPI with in-memory data store
- [ ] Mock AIAPI with stub responses
- [ ] Mock WorkspaceAPI with spy functions
- [ ] Publish to npm as `@notesync/plugin-testing`
