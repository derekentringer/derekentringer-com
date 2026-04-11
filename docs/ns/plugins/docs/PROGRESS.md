# NoteSync Plugin System — Progress

## Vision

A plugin system that makes NoteSync notes programmable — from the terminal, from scripts, from CI/CD, from other apps, and from community-built extensions. Unlike Obsidian (requires app running), Notion (rate-limited, no real-time), or Evernote (abandoned API), NoteSync plugins work headless, offline-first, and with built-in AI as a platform primitive.

## Competitive Advantages

- **API-first**: Plugins work without opening the app — CI/CD, scripts, servers, CLI
- **Real-time sync as a primitive**: SSE push/pull means plugins get live note change events (Notion can't do this, Obsidian can't do this)
- **Built-in AI as a platform API**: Plugins access embeddings, completions, transcription, semantic search without managing API keys
- **Stable, versioned, documented API**: Semantic versioning with deprecation cycle (Obsidian's #1 complaint is API instability)
- **True cross-platform parity**: REST API + sync engine means plugins work identically on web, desktop, mobile, and CLI
- **Offline-first plugin data**: SQLite sync engine can sync plugin data too — offline support for free
- **Sandboxed by architecture**: Server-side plugins run in isolated Fastify contexts, not in the UI process

## Architecture

```
@notesync/plugin-api             (types + interfaces, published to npm)
    |
    +-- Built-in Plugins
    |     plugin-transcription   (Whisper + Claude structuring)
    |     plugin-ai-tools        (agentic assistant tools)
    |     plugin-embeddings      (Voyage AI semantic search)
    |     plugin-image-analysis  (Claude Vision)
    |     plugin-import-export   (markdown, zip)
    |
    +-- Community Plugins        (npm packages with notesync field)
    |
NoteSync Host
    |
    +-- ns-api (Fastify)
    |     PluginLoader           (discover + register server plugins)
    |     HookRegistry           (beforeNoteSave, afterTranscribe, etc.)
    |     ServiceRegistry        (named services for inter-plugin use)
    |     AI API                 (embeddings, completions, search — exposed to plugins)
    |
    +-- ns-web / ns-desktop (React)
    |     PluginManager          (discover + activate client plugins)
    |     SlotProvider           (component injection: ribbon, toolbar, sidebar, etc.)
    |     CommandRegistry        (command palette + slash commands)
    |
    +-- ns-cli
          Plugin commands        (plugin install, list, enable, disable)
```

## Phases

### Phase 1 — Plugin API Foundation

- [ ] [00 — Plugin API Package](feature_planning/00-plugin-api-package.md)
- [ ] [01 — Server Plugin Loader](feature_planning/01-server-plugin-loader.md)
- [ ] [02 — Hook System](feature_planning/02-hook-system.md)

### Phase 2 — Extract Built-in Plugins

- [ ] [03 — Transcription Plugin](feature_planning/03-transcription-plugin.md)
- [ ] [04 — AI Tools Plugin](feature_planning/04-ai-tools-plugin.md)
- [ ] [05 — Embeddings Plugin](feature_planning/05-embeddings-plugin.md)
- [ ] [06 — Image Analysis Plugin](feature_planning/06-image-analysis-plugin.md)
- [ ] [07 — Import/Export Plugin](feature_planning/07-import-export-plugin.md)

### Phase 3 — Client Plugin System

- [ ] [08 — Client Plugin Manager](feature_planning/08-client-plugin-manager.md)
- [ ] [09 — UI Slot System](feature_planning/09-ui-slot-system.md)

### Phase 4 — Developer Experience

- [ ] [10 — Plugin Scaffolding CLI](feature_planning/10-plugin-scaffolding.md)
- [ ] [11 — Plugin Testing Framework](feature_planning/11-plugin-testing.md)

### Phase 5 — Ecosystem

- [ ] [12 — Plugin Directory & Marketplace](feature_planning/12-plugin-marketplace.md)
- [ ] [13 — Security & Sandboxing](feature_planning/13-security-sandboxing.md)
