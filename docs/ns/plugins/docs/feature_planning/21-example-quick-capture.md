# 21 — Example Plugin: Quick Capture

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `command`

## Summary

Append text to a designated "inbox" note from anywhere — command palette, keyboard shortcut, or CLI. Captures thoughts without navigating away from the current note. Demonstrates command registration, NotesAPI write operations, and cross-platform support including headless CLI usage.

## Manifest

```json
{
  "id": "notesync-quick-capture",
  "name": "Quick Capture",
  "version": "1.0.0",
  "description": "Quickly append text to an inbox note without switching context",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "command",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "mobile", "cli"],
  "settings": {
    "schema": {
      "inboxNoteTitle": { "type": "string", "description": "Title of the inbox note" },
      "inboxFolder": { "type": "string", "description": "Folder for the inbox note" },
      "timestampEntries": { "type": "boolean", "description": "Prepend timestamp to each capture" },
      "separator": { "type": "string", "description": "Separator between entries" }
    },
    "defaults": {
      "inboxNoteTitle": "Inbox",
      "inboxFolder": null,
      "timestampEntries": true,
      "separator": "---"
    }
  }
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

export default class QuickCapturePlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    // Command palette: open capture prompt
    host.commands.register({
      id: "quick-capture:capture",
      name: "Quick Capture",
      shortcut: "Ctrl+Shift+I",
      callback: () => this.capture(),
    });

    // Command palette: open inbox note
    host.commands.register({
      id: "quick-capture:open-inbox",
      name: "Open Inbox",
      callback: () => this.openInbox(),
    });
  }

  async activate() {}
  async deactivate() {}

  private async capture() {
    if (this.host.platform === "cli") {
      // CLI: text passed as argument
      return;
    }

    // UI: show input prompt
    const text = await this.host.workspace.showInputPrompt(
      "Quick Capture",
      "",
      { placeholder: "What's on your mind?", multiline: true }
    );

    if (!text?.trim()) return;
    await this.appendToInbox(text.trim());
  }

  async appendToInbox(text: string) {
    const settings = await this.host.settings.get<{
      inboxNoteTitle: string;
      inboxFolder: string | null;
      timestampEntries: boolean;
      separator: string;
    }>("settings");

    const title = settings?.inboxNoteTitle ?? "Inbox";

    // Find or create inbox note
    let inbox = await this.host.notes.getNoteByTitle(title);
    if (!inbox) {
      inbox = await this.host.notes.createNote({
        title,
        content: `# ${title}\n\n`,
        folderId: settings?.inboxFolder ? await this.findFolderId(settings.inboxFolder) : undefined,
      });
    }

    // Format entry
    const timestamp = settings?.timestampEntries
      ? `**${new Date().toLocaleString()}**\n`
      : "";
    const separator = settings?.separator ? `\n${settings.separator}\n\n` : "\n\n";
    const entry = `${timestamp}${text}`;

    // Append to inbox
    const newContent = inbox.content.trimEnd() + separator + entry + "\n";
    await this.host.notes.updateNote(inbox.id, { content: newContent });
  }

  private async openInbox() {
    const settings = await this.host.settings.get<{ inboxNoteTitle: string }>("settings");
    const title = settings?.inboxNoteTitle ?? "Inbox";
    const inbox = await this.host.notes.getNoteByTitle(title);
    if (inbox) {
      this.host.workspace.openNote(inbox.id);
    }
  }

  private async findFolderId(name: string): Promise<string | undefined> {
    const folders = await this.host.notes.listFolders();
    const folder = folders.find((f) => f.name === name);
    return folder?.id;
  }
}
```

## CLI Usage

```bash
# Quick capture from terminal
ns capture "Remember to review the PR"
ns capture "Book recommendation: Designing Data-Intensive Applications"

# Pipe content
echo "Meeting with Sarah at 3pm" | ns capture

# Multi-line
ns capture "Shopping list:
- Milk
- Eggs
- Bread"
```

The CLI command calls the same `appendToInbox()` method — identical behavior across platforms.

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.commands.register()` | Capture command with keyboard shortcut |
| `host.workspace.showInputPrompt()` | Multiline input prompt |
| `host.workspace.openNote()` | Navigate to inbox note |
| `host.notes.getNoteByTitle()` | Find inbox note |
| `host.notes.createNote()` | Auto-create inbox if it doesn't exist |
| `host.notes.updateNote()` | Append captured text |
| `host.notes.listFolders()` | Find folder by name |
| `host.platform` | Platform-specific behavior (CLI vs UI prompt) |
| CLI integration | Same plugin logic works headless via `ns capture` |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — all operations go through NotesAPI which handles encryption transparently
- Works in all encryption tiers
- Captured text is encrypted before storage like any other note content

## Tasks

- [ ] Create `packages/ns-plugin-quick-capture/`
- [ ] Implement capture command with input prompt
- [ ] Implement inbox note find-or-create
- [ ] Append with optional timestamp and separator
- [ ] CLI command: `ns capture "text"`
- [ ] Keyboard shortcut registration (Ctrl+Shift+I)
- [ ] Settings UI: inbox note title, folder, timestamp toggle, separator
- [ ] Tests: append logic, inbox creation, timestamp formatting
