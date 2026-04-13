# 18 — Example Plugin: Kanban Board

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `editor-extension`

## Summary

Renders fenced `kanban` code blocks as interactive drag-and-drop boards. Data is stored as markdown within the note — the board is a visual layer on top of portable text. Demonstrates CodeMirror 6 widget decoration, custom markdown rendering, and note content modification.

## Manifest

```json
{
  "id": "notesync-kanban",
  "name": "Kanban Board",
  "version": "1.0.0",
  "description": "Interactive drag-and-drop kanban boards stored as markdown",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "editor-extension",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop"],
  "settings": {
    "schema": {
      "defaultColumns": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Default columns for new boards"
      }
    },
    "defaults": {
      "defaultColumns": ["To Do", "In Progress", "Done"]
    }
  }
}
```

## Markdown Format

Kanban data lives inside a fenced code block, keeping notes portable:

````markdown
```kanban
## To Do
- [ ] Design landing page
- [ ] Write API docs

## In Progress
- [ ] Build plugin system
- [ ] Update tests

## Done
- [x] Setup project scaffolding
- [x] Create database schema
```
````

This is valid markdown — it renders as a readable checklist in any markdown viewer. NoteSync renders it as an interactive board.

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";
import { ViewPlugin, Decoration, WidgetType } from "@codemirror/view";
import type { EditorView, DecorationSet } from "@codemirror/view";

export default class KanbanPlugin implements Plugin {
  manifest = require("./manifest.json");

  register(host: NoteSync) {
    // Register CodeMirror extension
    host.workspace.registerEditorExtension({
      id: "kanban-widget",
      extension: kanbanViewPlugin,
    });

    // Register markdown preview renderer
    host.hooks.use("markdown:render", async (data, next) => {
      data.html = data.html.replace(
        /<pre><code class="language-kanban">([\s\S]*?)<\/code><\/pre>/g,
        (_, content) => renderKanbanHTML(decodeHTML(content))
      );
      return next();
    });

    // Register command to insert a new board
    host.commands.register({
      id: "kanban:insert",
      name: "Insert Kanban Board",
      callback: () => this.insertBoard(host),
    });
  }

  async activate() {}
  async deactivate() {}

  private async insertBoard(host: NoteSync) {
    const settings = await host.settings.get<{ defaultColumns: string[] }>("settings");
    const columns = settings?.defaultColumns ?? ["To Do", "In Progress", "Done"];
    const markdown = "```kanban\n" +
      columns.map((col) => `## ${col}\n- [ ] `).join("\n\n") +
      "\n```";
    host.workspace.insertAtCursor(markdown);
  }
}

// --- CodeMirror Widget ---

class KanbanWidget extends WidgetType {
  constructor(private content: string, private from: number, private to: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const board = document.createElement("div");
    board.className = "kanban-board";

    const columns = this.parseColumns(this.content);

    columns.forEach((col) => {
      const colEl = document.createElement("div");
      colEl.className = "kanban-column";

      const header = document.createElement("h3");
      header.textContent = col.title;
      colEl.appendChild(header);

      col.items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "kanban-card";
        card.draggable = true;
        card.textContent = item.text;

        // Drag and drop handlers
        card.addEventListener("dragstart", (e) => {
          e.dataTransfer?.setData("text/plain", JSON.stringify({ text: item.text, fromColumn: col.title }));
        });

        colEl.appendChild(card);
      });

      // Drop zone
      colEl.addEventListener("dragover", (e) => e.preventDefault());
      colEl.addEventListener("drop", (e) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer?.getData("text/plain") ?? "{}");
        if (data.fromColumn && data.fromColumn !== col.title) {
          this.moveCard(view, data.text, data.fromColumn, col.title);
        }
      });

      board.appendChild(colEl);
    });

    return board;
  }

  private parseColumns(content: string): { title: string; items: { text: string; done: boolean }[] }[] {
    const columns: { title: string; items: { text: string; done: boolean }[] }[] = [];
    let current: { title: string; items: { text: string; done: boolean }[] } | null = null;

    for (const line of content.split("\n")) {
      if (line.startsWith("## ")) {
        current = { title: line.slice(3).trim(), items: [] };
        columns.push(current);
      } else if (current && line.match(/^- \[[ x]\] /)) {
        const done = line.includes("[x]");
        const text = line.replace(/^- \[[ x]\] /, "").trim();
        if (text) current.items.push({ text, done });
      }
    }

    return columns;
  }

  private moveCard(view: EditorView, cardText: string, fromColumn: string, toColumn: string) {
    // Reconstruct the kanban markdown with the card moved
    const columns = this.parseColumns(this.content);
    const fromCol = columns.find((c) => c.title === fromColumn);
    const toCol = columns.find((c) => c.title === toColumn);

    if (!fromCol || !toCol) return;

    const itemIndex = fromCol.items.findIndex((i) => i.text === cardText);
    if (itemIndex === -1) return;

    const [item] = fromCol.items.splice(itemIndex, 1);
    toCol.items.push(item);

    const newContent = columns
      .map((col) => {
        const items = col.items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n");
        return `## ${col.title}\n${items}`;
      })
      .join("\n\n");

    // Replace the code block content in the editor
    view.dispatch({
      changes: { from: this.from, to: this.to, insert: "```kanban\n" + newContent + "\n```" },
    });
  }
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.workspace.registerEditorExtension()` | CodeMirror 6 view plugin with widget decoration |
| `host.hooks.use("markdown:render", ...)` | Custom rendering in preview mode |
| `host.commands.register()` | Command to insert new kanban board |
| `host.workspace.insertAtCursor()` | Insert markdown at cursor position |
| `host.settings.get()` | Default column configuration |
| CodeMirror `WidgetType` | Interactive DOM widget replacing code block |
| `view.dispatch()` | Programmatic editor content modification |

## CSS

```css
.kanban-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 8px 0;
}

.kanban-column {
  min-width: 200px;
  background: var(--bg-subtle);
  border-radius: 8px;
  padding: 12px;
}

.kanban-column h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.kanban-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  cursor: grab;
  font-size: 13px;
}

.kanban-card:active { cursor: grabbing; }
```

## E2E Encryption Compatibility

- `requiresPlaintext: false` — runs client-side, renders content already decrypted in the editor
- Works in all encryption tiers
- Board data is just markdown — encrypted like any other note content

## Tasks

- [ ] Create `packages/ns-plugin-kanban/`
- [ ] Implement CodeMirror widget for kanban code blocks
- [ ] Drag-and-drop card movement with editor content update
- [ ] Preview mode rendering via markdown:render middleware
- [ ] Insert board command with configurable default columns
- [ ] CSS theming using NoteSync CSS variables
- [ ] Tests: markdown parsing, column operations, card movement
