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

### Subscription Model

AI usage is included in the paid subscription — no credit system, no metering, no per-operation charges. The subscription price provides enough margin to cover AI compute costs for typical usage.

| Tier | AI | What's Included |
|---|---|---|
| **Free** | BYOK only (via community plugins) | Core app (notes, folders, tags, sync, editor) + community plugins |
| **Paid** | Included (NoteSync AI) + BYOK option | All first-party AI plugins + full AI usage included |

### BYOK (Bring Your Own Key)

Community plugins and power users can always bring their own API keys:

- Developer builds `@community/plugin-ollama` → calls Ollama directly → no NoteSync AI involved
- Power user configures their own OpenAI key in plugin settings → plugin calls OpenAI directly
- BYOK is available on all tiers, including Free
- Paid users can also use BYOK alongside NoteSync's included AI

### Revenue Model

- Paid subscription covers infrastructure + AI compute costs with margin
- Community plugins are always free — they expand the ecosystem and drive paid adoption
- First-party plugins demonstrate the platform and generate subscription revenue

## E2E Encryption & Plugins

When a user enables E2E encryption, plugin behavior depends on their chosen privacy tier:

| Privacy Tier | Server Plugins | Client Plugins |
|---|---|---|
| **E2E + Server Relay** | Receive transient plaintext for AI processing (never stored) | Full access to decrypted content |
| **E2E + BYOK Direct** | No plaintext access — ciphertext only | Full access to decrypted content + direct API calls |
| **E2E + No AI** | No plaintext access — ciphertext only | Full access to decrypted content, no AI |

Key rules:
- Client-side plugins always have access to decrypted note content (they run on the user's device)
- Server-side plugins only see ciphertext unless the user is in Server Relay mode
- Plugins that require plaintext declare `requiresPlaintext: true` in their manifest — disabled automatically when encryption prevents access
- Embeddings plugin is disabled with encryption (pgvector can't index ciphertext, embeddings leak content meaning)
- Plugin data storage offers an `encryptedStorage` option for sensitive derived data

See [E2E encryption feature plans](../../web/docs/feature_planning/38-e2e-encryption.md) for full details.

## Architecture

```
@notesync/plugin-api             (types + interfaces, published to npm)
    |
    +-- First-Party Plugins (paid tier, AI included in subscription)
    |     plugin-transcription   (Whisper + Claude)
    |     plugin-ai-tools        (agentic assistant tools)
    |     plugin-embeddings      (Voyage AI semantic search)
    |     plugin-image-analysis  (Claude Vision)
    |
    +-- Built-in Plugins (free, no AI)
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
- [ ] [02a — Scheduler API](feature_planning/02a-scheduler-api.md)
- [ ] [14 — Usage Tracking & Abuse Prevention](feature_planning/14-usage-tracking.md)

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

### Phase 6 — Example Plugins

First-party example plugins that showcase every plugin type and API feature. These serve as working examples for plugin developers and seed the ecosystem.

- [ ] [15 — Daily Journal](feature_planning/15-example-daily-journal.md) — sidebar panel, commands, NotesAPI, templates
- [ ] [16 — Ollama (Local LLM)](feature_planning/16-example-ollama.md) — ProviderRegistry, BYOK, streaming completions
- [ ] [17 — PDF Export](feature_planning/17-example-pdf-export.md) — commands, markdown rendering, platform-specific output
- [ ] [18 — Kanban Board](feature_planning/18-example-kanban.md) — CodeMirror widget, drag-and-drop, editor extensions
- [ ] [19 — Math/LaTeX](feature_planning/19-example-math-latex.md) — markdown render middleware, KaTeX, CSS injection
- [ ] [20 — Templater](feature_planning/20-example-templater.md) — commands, prompts, note lifecycle hooks, file includes
- [ ] [21 — Quick Capture](feature_planning/21-example-quick-capture.md) — commands, keyboard shortcuts, CLI integration
- [ ] [22 — Git Backup](feature_planning/22-example-git-backup.md) — event hooks, sync-handler, headless/CLI operation
- [ ] [23 — Google Calendar](feature_planning/23-example-google-calendar.md) — OAuth, external API, encrypted storage, background polling
- [ ] [24 — Word Count](feature_planning/24-example-word-count.md) — status bar, sidebar panel, real-time events (starter example)
- [ ] [25 — Voice Input](feature_planning/25-example-voice-input.md) — mic button for AI Assistant, TranscriptionProvider, WorkspaceAPI input control
- [ ] [26 — Reminders](feature_planning/26-example-reminders.md) — /setreminder slash command + AI tools, Scheduler API, persistent notifications
