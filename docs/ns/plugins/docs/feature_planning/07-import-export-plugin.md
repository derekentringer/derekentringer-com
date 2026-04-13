# 07 — Import/Export Plugin

**Status:** Planned
**Phase:** 2 — Extract Built-in Plugins
**Priority:** Medium

## Summary

Extract note import/export into `@notesync/plugin-import-export`. Currently basic functionality exists in the CLI plan; this formalizes it as a plugin that works across all platforms.

## Capabilities

### Export Formats
- **Markdown** — Single note to `.md` file
- **JSON** — Full note data (metadata + content)
- **ZIP** — Batch export (folder or all notes)

### Import Formats
- **Markdown** — `.md` files with title from first heading or filename
- **Obsidian vault** — Import from Obsidian directory structure (preserving folders, tags from frontmatter, wiki-links)
- **Notion export** — Import from Notion HTML/CSV export
- **Plain text** — `.txt` files

## Plugin Registration

```typescript
export default class ImportExportPlugin implements Plugin {
  register(host: NoteSync) {
    host.services.register("import-export", {
      exporters: [markdownExporter, jsonExporter, zipExporter],
      importers: [markdownImporter, obsidianImporter, notionImporter],
    });

    host.commands.register({
      id: "import-export.export",
      name: "Export Note",
      execute: (noteId, format) => { ... }
    });
  }
}
```

## Third-Party Extensions

- `@notesync/plugin-export-pdf` — PDF export via puppeteer/playwright
- `@notesync/plugin-export-docx` — Word document export
- `@notesync/plugin-import-evernote` — Evernote ENEX import
- `@notesync/plugin-export-confluence` — Publish to Confluence

## Tasks

- [ ] Create `packages/ns-plugin-import-export/`
- [ ] Define `Exporter` and `Importer` interfaces in plugin-api
- [ ] Implement markdown, JSON, ZIP exporters
- [ ] Implement markdown importer with title extraction
- [ ] Implement Obsidian vault importer (frontmatter, wiki-links, folders)
- [ ] Register as commands accessible from CLI, web, desktop
