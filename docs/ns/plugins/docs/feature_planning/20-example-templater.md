# 20 — Example Plugin: Templater

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `full` (command + processor)

## Summary

Dynamic note templates with variables, date functions, file includes, and interactive prompts. Goes beyond static templates — content is generated at insertion time. Demonstrates command registration, slash commands, note lifecycle hooks, and the NotesAPI.

## Manifest

```json
{
  "id": "notesync-templater",
  "name": "Templater",
  "version": "1.0.0",
  "description": "Dynamic note templates with variables, dates, prompts, and file includes",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "full",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "mobile"],
  "settings": {
    "schema": {
      "templatesFolder": { "type": "string", "description": "Folder containing template notes" },
      "dateFormat": { "type": "string", "description": "Default date format" }
    },
    "defaults": {
      "templatesFolder": "Templates",
      "dateFormat": "YYYY-MM-DD"
    }
  }
}
```

## Template Syntax

Templates are regular notes in a designated folder. Variables use `<% %>` delimiters:

```markdown
# <% tp.prompt("Project Name") %> — Meeting Notes

**Date:** <% tp.date("YYYY-MM-DD") %>
**Day:** <% tp.date("dddd") %>
**Attendees:** <% tp.prompt("Who attended?") %>

## Agenda

<% tp.cursor() %>

## Action Items

- [ ]

## Next Steps


---
*Created from template: Meeting Notes*
*Tags:* #meeting #<% tp.date("YYYY") %>-Q<% tp.date("Q") %>
```

## Available Functions

```typescript
interface TemplaterAPI {
  // Date/time
  date(format?: string): string;              // Current date in given format
  date(format: string, offset: string): string; // "YYYY-MM-DD", "+1d" or "-1w"
  time(format?: string): string;              // Current time

  // User input
  prompt(label: string, defaultValue?: string): Promise<string>;
  choose(label: string, options: string[]): Promise<string>;

  // Note context
  title(): string;                            // Current note title
  folder(): string;                           // Current folder name
  tags(): string[];                           // Current note tags

  // File operations
  include(noteTitle: string): Promise<string>; // Include content from another note

  // Cursor
  cursor(): string;                           // Place cursor here after template insertion
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

export default class TemplaterPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    // Command palette: apply template to current note
    host.commands.register({
      id: "templater:apply",
      name: "Apply Template",
      callback: () => this.showTemplatePicker(),
    });

    // Command palette: create note from template
    host.commands.register({
      id: "templater:create",
      name: "Create Note from Template",
      callback: () => this.createFromTemplate(),
    });

    // Hook: process templates in newly created notes
    host.hooks.tap("after:note:create", async (note) => {
      if (this.containsTemplateVars(note.content)) {
        const processed = await this.processTemplate(note.content);
        await host.notes.updateNote(note.id, { content: processed });
      }
    });
  }

  async activate() {}
  async deactivate() {}

  private containsTemplateVars(content: string): boolean {
    return /<%[\s\S]*?%>/.test(content);
  }

  private async showTemplatePicker() {
    const templates = await this.getTemplates();
    const selected = await this.host.workspace.showQuickPick(
      templates.map((t) => ({ label: t.title, value: t.id }))
    );
    if (!selected) return;

    const template = await this.host.notes.getNote(selected);
    if (!template) return;

    const processed = await this.processTemplate(template.content);
    this.host.workspace.insertAtCursor(processed);
  }

  private async createFromTemplate() {
    const templates = await this.getTemplates();
    const selected = await this.host.workspace.showQuickPick(
      templates.map((t) => ({ label: t.title, value: t.id }))
    );
    if (!selected) return;

    const template = await this.host.notes.getNote(selected);
    if (!template) return;

    const processed = await this.processTemplate(template.content);

    // Extract title from first heading or prompt
    const titleMatch = processed.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `Note from ${template.title}`;

    const note = await this.host.notes.createNote({ title, content: processed });
    this.host.workspace.openNote(note.id);
  }

  private async getTemplates() {
    const settings = await this.host.settings.get<{ templatesFolder: string }>("settings");
    const folderName = settings?.templatesFolder ?? "Templates";
    return this.host.notes.listNotes({ folder: folderName });
  }

  private async processTemplate(content: string): Promise<string> {
    const tp = this.createTemplaterAPI();
    let result = content;

    // Process all <% %> blocks
    const regex = /<%\s*([\s\S]*?)\s*%>/g;
    const replacements: { match: string; value: string }[] = [];

    let match;
    while ((match = regex.exec(content)) !== null) {
      const expr = match[1];
      try {
        const value = await this.evaluateExpression(expr, tp);
        replacements.push({ match: match[0], value: String(value) });
      } catch (e) {
        replacements.push({ match: match[0], value: `[Error: ${e}]` });
      }
    }

    for (const r of replacements) {
      result = result.replace(r.match, r.value);
    }

    return result;
  }

  private createTemplaterAPI() {
    return {
      date: (format?: string, offset?: string) => {
        let d = new Date();
        if (offset) d = this.applyOffset(d, offset);
        return this.formatDate(d, format ?? "YYYY-MM-DD");
      },
      time: (format?: string) => this.formatTime(new Date(), format ?? "HH:mm"),
      prompt: async (label: string, defaultValue?: string) => {
        return this.host.workspace.showInputPrompt(label, defaultValue) ?? "";
      },
      choose: async (label: string, options: string[]) => {
        return this.host.workspace.showQuickPick(
          options.map((o) => ({ label: o, value: o }))
        ) ?? options[0];
      },
      cursor: () => "",  // Marker removed after processing, cursor placed here
      include: async (title: string) => {
        const note = await this.host.notes.getNoteByTitle(title);
        return note?.content ?? `[Note "${title}" not found]`;
      },
    };
  }

  private async evaluateExpression(expr: string, tp: any): Promise<string> {
    // Parse tp.functionName(args) calls
    const fnMatch = expr.match(/^tp\.(\w+)\((.*)\)$/);
    if (!fnMatch) return expr;

    const [, fnName, argsStr] = fnMatch;
    const fn = tp[fnName];
    if (!fn) return `[Unknown: tp.${fnName}]`;

    // Parse arguments (simple string literal parsing)
    const args = argsStr
      .split(",")
      .map((a) => a.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);

    return fn(...args);
  }

  private applyOffset(date: Date, offset: string): Date {
    const match = offset.match(/^([+-]\d+)([dwmy])$/);
    if (!match) return date;
    const [, amount, unit] = match;
    const d = new Date(date);
    const n = parseInt(amount);
    if (unit === "d") d.setDate(d.getDate() + n);
    if (unit === "w") d.setDate(d.getDate() + n * 7);
    if (unit === "m") d.setMonth(d.getMonth() + n);
    if (unit === "y") d.setFullYear(d.getFullYear() + n);
    return d;
  }

  private formatDate(d: Date, fmt: string): string {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const q = Math.ceil(m / 3);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return fmt
      .replace("YYYY", String(y))
      .replace("MM", String(m).padStart(2, "0"))
      .replace("DD", String(day).padStart(2, "0"))
      .replace("dddd", dayNames[d.getDay()])
      .replace("Q", String(q));
  }

  private formatTime(d: Date, fmt: string): string {
    return fmt
      .replace("HH", String(d.getHours()).padStart(2, "0"))
      .replace("mm", String(d.getMinutes()).padStart(2, "0"));
  }
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.commands.register()` | Apply template, create from template |
| `host.hooks.tap("after:note:create", ...)` | Auto-process templates in new notes |
| `host.workspace.showQuickPick()` | Template picker UI |
| `host.workspace.showInputPrompt()` | Interactive prompts during template processing |
| `host.workspace.insertAtCursor()` | Insert processed template |
| `host.workspace.openNote()` | Navigate to created note |
| `host.notes.listNotes()` | List templates from folder |
| `host.notes.getNoteByTitle()` | Include content from another note |
| `host.notes.createNote()` | Create note from template |
| `host.settings.get()` | Templates folder, date format |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — all processing happens client-side on decrypted content
- Template notes are encrypted like any other note
- Works in all encryption tiers

## Tasks

- [ ] Create `packages/ns-plugin-templater/`
- [ ] Implement template variable parser (`<% %>` syntax)
- [ ] Implement TemplaterAPI (date, time, prompt, choose, include, cursor)
- [ ] Template picker with quick pick UI
- [ ] "Create from template" flow
- [ ] Auto-process hook for new notes containing template vars
- [ ] Date offset support (+1d, -1w, etc.)
- [ ] Tests: variable parsing, date formatting, offset calculation, include resolution
