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

### Pricing Tiers

| Tier | AI Credits | What's Included |
|---|---|---|
| **Free** | 0 | Core app (notes, folders, tags, sync, editor) + community plugins (BYOK only) |
| **Pro** ($X/mo) | Y credits/month | All first-party AI plugins + included credits |

- **Free tier** is fully functional for note-taking — no AI, no credit system
- **Pro tier** includes all first-party plugins AND a monthly AI credit allowance
- Credits cover normal usage; heavy users can purchase additional credits or bring their own API keys (BYOK)

### Credit System

A server-side metering layer that sits between first-party plugins and the AI providers:

```
Plugin makes AI call
    → CreditMeter middleware
        → check user's credit balance
            → has credits → route to AI provider → deduct credits
            → no credits → return "credit limit reached" error
```

**Credit costs** (approximate, based on underlying API costs + margin):

| Operation | Credits |
|---|---|
| AI chat response (1 tool round) | 1 credit |
| AI chat response (multi-tool) | 2 credits |
| Note summarization | 1 credit |
| Tag generation | 1 credit |
| Audio transcription (per minute) | 2 credits |
| Transcript structuring | 1 credit |
| Embedding generation (per note) | 0.1 credits |
| Image analysis | 1 credit |
| Semantic search query | 0.1 credits |

**What the credit system needs:**

```sql
-- User credit balance
ALTER TABLE users ADD COLUMN credit_balance DECIMAL DEFAULT 0;
ALTER TABLE users ADD COLUMN credit_reset_at TIMESTAMP;

-- Usage tracking
CREATE TABLE credit_usage (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  plugin_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  credits_used DECIMAL NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### BYOK (Bring Your Own Key)

Community plugins and power users bypass the credit system entirely:

- Developer builds `@community/plugin-ollama` → calls Ollama directly → zero NoteSync credits used
- Power user configures their own OpenAI key in plugin settings → plugin calls OpenAI directly → zero credits used
- BYOK is always available on all tiers, including Free

The credit system ONLY meters calls routed through NoteSync's first-party AI providers.

### Revenue Model

- Pro subscription covers the base cost + margin on included credits
- Additional credit packs available for purchase (e.g., 100 credits for $Y)
- Community plugins are always free — they expand the ecosystem and drive Pro adoption
- First-party plugins demonstrate the platform and generate subscription revenue

## Architecture

```
@notesync/plugin-api             (types + interfaces, published to npm)
    |
    +-- First-Party Plugins (Pro tier, metered via credits)
    |     plugin-transcription   (Whisper + Claude)
    |     plugin-ai-tools        (agentic assistant tools)
    |     plugin-embeddings      (Voyage AI semantic search)
    |     plugin-image-analysis  (Claude Vision)
    |
    +-- Built-in Plugins (free, no credits)
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
    |     CreditMeter            (metering layer for first-party AI providers)
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
- [ ] [14 — Credit System](feature_planning/14-credit-system.md)

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
