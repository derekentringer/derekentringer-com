# 17 — Example Plugin: PDF Export

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `command`

## Summary

Export notes as styled PDF files. Renders markdown to HTML, applies a print stylesheet, and generates a PDF via the browser's print API (web/desktop) or a headless renderer (CLI). Demonstrates command registration, processor middleware, and the NotesAPI read path.

## Manifest

```json
{
  "id": "notesync-pdf-export",
  "name": "PDF Export",
  "version": "1.0.0",
  "description": "Export notes as styled PDF files",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "command",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "cli"],
  "settings": {
    "schema": {
      "pageSize": { "type": "string", "enum": ["A4", "Letter", "Legal"] },
      "includeMetadata": { "type": "boolean", "description": "Include title, date, tags at top" },
      "includeTableOfContents": { "type": "boolean", "description": "Auto-generate TOC from headings" },
      "theme": { "type": "string", "enum": ["light", "dark", "minimal"] }
    },
    "defaults": {
      "pageSize": "Letter",
      "includeMetadata": true,
      "includeTableOfContents": false,
      "theme": "light"
    }
  }
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";
import { marked } from "marked";

export default class PdfExportPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    host.commands.register({
      id: "pdf-export:current",
      name: "Export Current Note as PDF",
      callback: () => this.exportCurrentNote(),
    });

    host.commands.register({
      id: "pdf-export:by-id",
      name: "Export Note as PDF",
      callback: (noteId: string) => this.exportNote(noteId),
    });
  }

  async activate() {}
  async deactivate() {}

  private async exportCurrentNote() {
    const activeNote = this.host.workspace.getActiveNote();
    if (!activeNote) return;
    await this.exportNote(activeNote.id);
  }

  private async exportNote(noteId: string) {
    const note = await this.host.notes.getNote(noteId);
    if (!note) return;

    const settings = await this.host.settings.get<{
      pageSize: string;
      includeMetadata: boolean;
      includeTableOfContents: boolean;
      theme: string;
    }>("settings");

    // Render markdown to HTML
    let html = marked.parse(note.content);

    // Run through the markdown:render middleware chain
    const rendered = await this.host.hooks.run("before:render:preview", note.content, note.id);
    html = marked.parse(rendered);

    // Build full document
    const doc = this.buildDocument(note, html, settings);

    // Platform-specific PDF generation
    if (this.host.platform === "cli") {
      await this.exportViaPuppeteer(doc, note.title);
    } else {
      await this.exportViaPrintApi(doc);
    }
  }

  private buildDocument(note: any, html: string, settings: any): string {
    const css = this.getThemeCSS(settings?.theme ?? "light");
    const metadata = settings?.includeMetadata
      ? `<div class="metadata">
           <h1>${note.title}</h1>
           <p class="date">${new Date(note.updatedAt).toLocaleDateString()}</p>
           ${note.tags?.length ? `<p class="tags">${note.tags.map((t: string) => `#${t}`).join(" ")}</p>` : ""}
         </div>`
      : "";

    const toc = settings?.includeTableOfContents ? this.generateTOC(html) : "";

    return `<!DOCTYPE html>
<html>
<head>
  <style>${css}</style>
</head>
<body>
  ${metadata}
  ${toc}
  <div class="content">${html}</div>
</body>
</html>`;
  }

  private generateTOC(html: string): string {
    const headings: { level: number; text: string }[] = [];
    html.replace(/<h([1-3])[^>]*>(.*?)<\/h\1>/g, (_, level, text) => {
      headings.push({ level: parseInt(level), text: text.replace(/<[^>]+>/g, "") });
      return "";
    });

    if (headings.length === 0) return "";

    const items = headings
      .map((h) => `<li class="toc-${h.level}">${h.text}</li>`)
      .join("\n");

    return `<div class="toc"><h2>Table of Contents</h2><ul>${items}</ul></div>`;
  }

  private getThemeCSS(theme: string): string {
    const base = `
      body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
      .metadata h1 { margin-bottom: 4px; }
      .metadata .date { color: #666; font-size: 14px; }
      .metadata .tags { color: #888; font-size: 13px; }
      .toc { border: 1px solid #e0e0e0; padding: 16px; margin-bottom: 24px; border-radius: 4px; }
      .toc ul { list-style: none; padding: 0; }
      .toc-2 { padding-left: 16px; }
      .toc-3 { padding-left: 32px; }
      code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
      pre code { display: block; padding: 16px; overflow-x: auto; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      img { max-width: 100%; }
    `;

    if (theme === "dark") return base + "body { background: #1a1a1a; color: #e0e0e0; }";
    if (theme === "minimal") return base + "body { font-size: 13px; padding: 20px; }";
    return base;
  }

  private async exportViaPrintApi(html: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }

  private async exportViaPuppeteer(html: string, title: string) {
    // CLI: use puppeteer for headless PDF generation
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: `${title}.pdf`, format: "Letter" });
    await browser.close();
  }
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.commands.register()` | Two commands: export current, export by ID |
| `host.workspace.getActiveNote()` | Get currently open note |
| `host.notes.getNote()` | Read note content for rendering |
| `host.hooks.run()` | Run markdown render middleware before export |
| `host.settings.get()` | Read export settings (page size, theme, etc.) |
| `host.platform` | Platform-specific PDF generation (print API vs puppeteer) |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — runs client-side where notes are already decrypted
- On CLI: would need plaintext access server-side for headless export. CLI should decrypt locally before calling export.
- Works in all encryption tiers on web/desktop

## Tasks

- [ ] Create `packages/ns-plugin-pdf-export/`
- [ ] Implement markdown → HTML → PDF pipeline
- [ ] Three theme stylesheets (light, dark, minimal)
- [ ] Table of contents generation from headings
- [ ] Metadata header (title, date, tags)
- [ ] Platform-specific export: browser print API, puppeteer (CLI)
- [ ] Settings UI for page size, theme, metadata, TOC toggles
- [ ] Tests: HTML generation, TOC extraction, theme application
