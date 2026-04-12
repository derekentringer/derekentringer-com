# 24 — Example Plugin: Word Count / Reading Time

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Low
**Plugin Type:** `sidebar-panel`

## Summary

Live word count, character count, and estimated reading time for the active note. Displayed in a lightweight sidebar panel or status bar. The simplest possible plugin — perfect as a "hello world" starter example showing how little code is needed to extend NoteSync.

## Manifest

```json
{
  "id": "notesync-word-count",
  "name": "Word Count",
  "version": "1.0.0",
  "description": "Live word count, character count, and reading time for the active note",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "sidebar-panel",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "mobile"]
}
```

## Plugin Implementation

This is intentionally minimal — the entire plugin is ~60 lines:

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

export default class WordCountPlugin implements Plugin {
  manifest = require("./manifest.json");

  register(host: NoteSync) {
    // Register a status bar item (lightweight alternative to sidebar panel)
    host.workspace.registerStatusBarItem({
      id: "word-count-status",
      position: "right",
      component: () => import("./WordCountStatus"),
    });

    // Also register a sidebar panel with more detail
    host.workspace.registerPanel({
      id: "word-count-panel",
      name: "Statistics",
      icon: "bar-chart",
      slot: "sidebar",
      component: () => import("./WordCountPanel"),
    });
  }

  async activate() {}
  async deactivate() {}
}
```

## Status Bar Component

```typescript
// WordCountStatus.tsx — minimal status bar display
import { useState, useEffect } from "react";
import type { NoteSync } from "@notesync/plugin-api";

export function WordCountStatus({ host }: { host: NoteSync }) {
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const note = host.workspace.getActiveNote();
      if (note) {
        setWordCount(countWords(note.content));
      } else {
        setWordCount(0);
      }
    };

    // Update on note change and content change
    host.events.on("note:updated", update);
    host.workspace.onActiveNoteChange(update);
    update();

    return () => {
      host.events.off("note:updated", update);
    };
  }, []);

  if (wordCount === 0) return null;
  return <span className="text-xs text-muted">{wordCount} words</span>;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
```

## Sidebar Panel Component

```typescript
// WordCountPanel.tsx — detailed statistics panel
import { useState, useEffect } from "react";
import type { NoteSync } from "@notesync/plugin-api";

export function WordCountPanel({ host }: { host: NoteSync }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const update = () => {
      const note = host.workspace.getActiveNote();
      if (note) {
        setStats(calculateStats(note.content));
      } else {
        setStats(null);
      }
    };

    host.events.on("note:updated", update);
    host.workspace.onActiveNoteChange(update);
    update();

    return () => {
      host.events.off("note:updated", update);
    };
  }, []);

  if (!stats) {
    return <p className="text-muted text-sm p-4">No note selected</p>;
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold">Note Statistics</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Words" value={stats.words.toLocaleString()} />
        <Stat label="Characters" value={stats.characters.toLocaleString()} />
        <Stat label="Sentences" value={stats.sentences.toLocaleString()} />
        <Stat label="Paragraphs" value={stats.paragraphs.toLocaleString()} />
        <Stat label="Headings" value={stats.headings.toLocaleString()} />
        <Stat label="Links" value={stats.links.toLocaleString()} />
        <Stat label="Reading time" value={stats.readingTime} />
        <Stat label="Speaking time" value={stats.speakingTime} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted">{label}</span>
      <span className="ml-2 font-medium">{value}</span>
    </div>
  );
}

interface Stats {
  words: number;
  characters: number;
  sentences: number;
  paragraphs: number;
  headings: number;
  links: number;
  readingTime: string;
  speakingTime: string;
}

function calculateStats(content: string): Stats {
  // Strip markdown syntax for accurate word count
  const plainText = content
    .replace(/^#{1,6}\s+/gm, "")        // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/[*_~`]/g, "")              // emphasis
    .replace(/```[\s\S]*?```/g, "")      // code blocks
    .replace(/^\s*[-*+]\s+/gm, "")       // list markers
    .replace(/^\s*\d+\.\s+/gm, "");      // ordered list markers

  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  const characters = plainText.length;
  const sentences = plainText.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const headings = (content.match(/^#{1,6}\s+/gm) || []).length;
  const links = (content.match(/\[\[.*?\]\]|\[.*?\]\(.*?\)/g) || []).length;

  // Average reading speed: 238 wpm, speaking speed: 150 wpm
  const readingMinutes = Math.ceil(words / 238);
  const speakingMinutes = Math.ceil(words / 150);

  return {
    words,
    characters,
    sentences,
    paragraphs,
    headings,
    links,
    readingTime: readingMinutes < 1 ? "< 1 min" : `${readingMinutes} min`,
    speakingTime: speakingMinutes < 1 ? "< 1 min" : `${speakingMinutes} min`,
  };
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.workspace.registerStatusBarItem()` | Lightweight status bar display |
| `host.workspace.registerPanel()` | Detailed sidebar panel |
| `host.workspace.getActiveNote()` | Read current note content |
| `host.workspace.onActiveNoteChange()` | React to note selection changes |
| `host.events.on("note:updated", ...)` | React to content changes in real-time |
| `host.events.off()` | Clean up event listeners |

## Why This Is a Good Starter Example

- **~60 lines of plugin code** — smallest possible useful plugin
- **No API calls, no state, no settings** — pure computation
- **Immediate feedback** — type in editor, see count update
- **Shows two extension points** — status bar and sidebar panel
- **Shows event system** — listening for note changes
- **Zero dependencies** — no external libraries needed

## E2E Encryption Compatibility

- `requiresPlaintext: false` — runs client-side on decrypted content
- Works in all encryption tiers
- No data stored — purely reactive computation

## Tasks

- [ ] Create `packages/ns-plugin-word-count/`
- [ ] Implement status bar component
- [ ] Implement sidebar panel with detailed stats
- [ ] Markdown-aware word counting (strip syntax)
- [ ] Reading time and speaking time calculation
- [ ] Real-time updates via event listener
- [ ] Tests: word counting, markdown stripping, edge cases (empty note, code-heavy note)
