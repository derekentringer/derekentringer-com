# 15 — Example Plugin: Daily Journal

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `full` (sidebar-panel + command + processor)

## Summary

Auto-creates a daily note from a configurable template and provides a sidebar panel for quick access to today's entry. Demonstrates sidebar panel slots, note creation via NotesAPI, template rendering, command registration, and event hooks.

## Manifest

```json
{
  "id": "notesync-daily-journal",
  "name": "Daily Journal",
  "version": "1.0.0",
  "description": "Auto-create daily notes from templates with a dedicated sidebar panel",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "full",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "mobile"],
  "settings": {
    "schema": {
      "folder": { "type": "string", "description": "Folder for daily notes" },
      "template": { "type": "string", "description": "Template content with variables" },
      "titleFormat": { "type": "string", "description": "Date format for note title" },
      "autoCreate": { "type": "boolean", "description": "Auto-create on app open" }
    },
    "defaults": {
      "folder": "Journal",
      "template": "# {{date}}\n\n## Morning\n\n\n## Tasks\n\n- [ ] \n\n## Notes\n\n\n## Reflection\n\n",
      "titleFormat": "YYYY-MM-DD",
      "autoCreate": true
    }
  }
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync, Note } from "@notesync/plugin-api";

export default class DailyJournalPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    // Register commands
    host.commands.register({
      id: "daily-journal:open-today",
      name: "Open Today's Journal",
      callback: () => this.openToday(),
    });

    host.commands.register({
      id: "daily-journal:open-yesterday",
      name: "Open Yesterday's Journal",
      callback: () => this.openDate(this.yesterday()),
    });
  }

  async activate(host: NoteSync) {
    // Register sidebar panel
    host.workspace.registerPanel({
      id: "daily-journal-panel",
      name: "Journal",
      icon: "calendar",
      slot: "sidebar",
      component: () => import("./JournalPanel"),
    });

    // Auto-create today's note on app open
    const settings = await host.settings.get<{ autoCreate: boolean }>("settings");
    if (settings?.autoCreate) {
      await this.ensureTodayExists();
    }
  }

  async deactivate() {}

  // --- Helpers ---

  private async openToday() {
    const note = await this.ensureTodayExists();
    this.host.workspace.openNote(note.id);
  }

  private async openDate(date: Date) {
    const title = this.formatDate(date);
    let note = await this.host.notes.getNoteByTitle(title);
    if (!note) {
      note = await this.createDailyNote(date);
    }
    this.host.workspace.openNote(note.id);
  }

  private async ensureTodayExists(): Promise<Note> {
    const title = this.formatDate(new Date());
    let note = await this.host.notes.getNoteByTitle(title);
    if (!note) {
      note = await this.createDailyNote(new Date());
    }
    return note;
  }

  private async createDailyNote(date: Date): Promise<Note> {
    const settings = await this.host.settings.get<{
      folder: string;
      template: string;
      titleFormat: string;
    }>("settings");

    const title = this.formatDate(date);
    const content = this.renderTemplate(settings?.template ?? "", date);

    // Ensure folder exists
    const folders = await this.host.notes.listFolders();
    const folderName = settings?.folder ?? "Journal";
    let folder = folders.find((f) => f.name === folderName);
    if (!folder) {
      folder = await this.host.notes.createFolder(folderName);
    }

    return this.host.notes.createNote({
      title,
      content,
      folderId: folder.id,
      tags: ["journal", "daily"],
    });
  }

  private renderTemplate(template: string, date: Date): string {
    return template
      .replace(/\{\{date\}\}/g, this.formatDate(date))
      .replace(/\{\{day\}\}/g, date.toLocaleDateString("en-US", { weekday: "long" }))
      .replace(/\{\{month\}\}/g, date.toLocaleDateString("en-US", { month: "long" }))
      .replace(/\{\{year\}\}/g, String(date.getFullYear()));
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  private yesterday(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
}
```

## Sidebar Panel Component

```typescript
// JournalPanel.tsx — React component rendered in sidebar slot
export function JournalPanel({ host }: { host: NoteSync }) {
  const [recentEntries, setRecentEntries] = useState<NoteSummary[]>([]);

  useEffect(() => {
    host.notes.listNotes({ tags: ["journal"], sort: "createdAt", limit: 7 })
      .then(setRecentEntries);
  }, []);

  return (
    <div>
      <button onClick={() => host.commands.execute("daily-journal:open-today")}>
        Open Today
      </button>
      <h3>Recent Entries</h3>
      <ul>
        {recentEntries.map((note) => (
          <li key={note.id} onClick={() => host.workspace.openNote(note.id)}>
            {note.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.commands.register()` | Two commands: open today, open yesterday |
| `host.workspace.registerPanel()` | Sidebar panel with journal entries |
| `host.workspace.openNote()` | Navigate to a note |
| `host.notes.getNoteByTitle()` | Check if daily note exists |
| `host.notes.createNote()` | Create note from template |
| `host.notes.createFolder()` | Ensure journal folder exists |
| `host.notes.listNotes()` | Query recent journal entries |
| `host.settings.get()` | Read user-configurable settings |
| Plugin manifest `settings` | Declarative settings schema with defaults |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — creates notes via NotesAPI, which handles encryption transparently
- Works in all encryption tiers (including No AI)
- Template rendering happens client-side with decrypted content

## Tasks

- [ ] Create `packages/ns-plugin-daily-journal/`
- [ ] Implement plugin class with register/activate
- [ ] Build sidebar panel component
- [ ] Template variable rendering engine
- [ ] Settings UI for folder, template, title format, auto-create
- [ ] Tests: note creation, template rendering, duplicate prevention
