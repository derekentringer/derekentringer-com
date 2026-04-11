# NoteSync Plugin System — Progress

## Vision

A plugin system that makes NoteSync notes programmable — from the terminal, from scripts, from CI/CD, from other apps, and from community-built extensions. Unlike Obsidian (requires app running), Notion (rate-limited, no real-time), or Evernote (abandoned API), NoteSync plugins work headless, offline-first, and provider-agnostic.

## Competitive Advantages

- **API-first**: Plugins work without opening the app — CI/CD, scripts, servers, CLI
- **Real-time sync as a primitive**: SSE push/pull means plugins get live note change events (Notion can't do this, Obsidian can't do this)
- **Provider-agnostic AI**: Plugin API defines interfaces (transcription, embeddings, completions) — developers bring their own AI keys and providers. NoteSync's Whisper/Claude/Voyage are just the default plugins, swappable for OpenAI, Gemini, Deepgram, local models, etc.
- **Stable, versioned, documented API**: Semantic versioning with deprecation cycle (Obsidian's #1 complaint is API instability)
- **True cross-platform parity**: REST API + sync engine means plugins work identically on web, desktop, mobile, and CLI
- **Offline-first plugin data**: SQLite sync engine can sync plugin data too — offline support for free
- **Sandboxed by architecture**: Server-side plugins run in isolated Fastify contexts, not in the UI process

## Business Model

NoteSync's own AI-powered features ship as first-party plugins included in paid tiers:

| Tier | Included Plugins |
|---|---|
| **Free** | Core app (notes, folders, tags, sync, editor) + community plugins |
| **Pro** | + AI Assistant (agentic tools, chat, slash commands) + Audio Transcription (Whisper + Claude) |
| **Team** | + Embeddings & Semantic Search (Voyage AI) + Image Analysis (Claude Vision) + priority support |

This model:
- **Free tier** is fully functional for note-taking — AI is the upsell
- **Plugin authors** bring their own API keys — NoteSync doesn't subsidize third-party AI costs
- **First-party plugins** demonstrate the platform's capabilities and generate revenue
- **Community plugins** are always free and expand the ecosystem

## Architecture

```
@notesync/plugin-api             (types + interfaces, published to npm)
    |
    +-- First-Party Plugins (paid tiers)
    |     plugin-transcription   (Whisper + Claude — Pro tier)
    |     plugin-ai-tools        (agentic assistant — Pro tier)
    |     plugin-embeddings      (Voyage AI search — Team tier)
    |     plugin-image-analysis  (Claude Vision — Team tier)
    |
    +-- Built-in Plugins (free)
    |     plugin-import-export   (markdown, zip)
    |
    +-- Community Plugins        (npm packages, bring-your-own AI keys)
    |
NoteSync Host
    |
    +-- ns-api (Fastify)
    |     PluginLoader           (discover + register server plugins)
    |     HookRegistry           (beforeNoteSave, afterTranscribe, etc.)
    |     ServiceRegistry        (named services for inter-plugin use)
    |     ProviderRegistry       (AI provider interfaces — plugins implement, not consume)
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
