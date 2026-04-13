# 00 — Plugin API Package

**Status:** Planned
**Phase:** 1 — Plugin API Foundation
**Priority:** High

## Summary

Create `@notesync/plugin-api` — a TypeScript-only package that defines the plugin contract. Zero runtime dependencies. Published to npm so plugin authors install it as a dev dependency for type checking.

## Package Structure

```
packages/ns-plugin-api/
  src/
    index.ts              # Re-exports all types
    plugin.ts             # Plugin interface + lifecycle
    manifest.ts           # PluginManifest type
    host.ts               # NoteSync host interface (what plugins receive)
    notes.ts              # NotesAPI — note/folder/tag CRUD
    providers.ts          # AI provider interfaces (plugins implement these)
    editor.ts             # EditorAPI — CodeMirror extensions, markdown processing
    workspace.ts          # WorkspaceAPI — UI slots, panels, commands
    settings.ts           # SettingsAPI — plugin configuration
    events.ts             # Event types for hooks
  package.json
  tsconfig.json
```

## Core Interfaces

### Plugin Interface

```typescript
export interface Plugin {
  manifest: PluginManifest;

  /** Phase 1: Declare capabilities (commands, views, settings).
      No side effects. Called before other plugins may be ready. */
  register(host: NoteSync): void;

  /** Phase 2: Runtime initialization. All plugins have registered.
      Safe to query other plugins. */
  activate(host: NoteSync): void | Promise<void>;

  /** Called when plugin settings change at runtime */
  onSettingsChange?(settings: Record<string, unknown>): void;

  /** Cleanup. Release resources, remove listeners.
      All registered resources auto-cleanup (commands, hooks, etc.) */
  deactivate(): void | Promise<void>;
}
```

### Plugin Manifest

```typescript
export interface PluginManifest {
  id: string;                           // Unique identifier (e.g., "notesync-kanban")
  name: string;                         // Human-readable name
  version: string;                      // Semver
  description?: string;
  author?: string;
  homepage?: string;
  hostApiVersion: string;               // Semver range (e.g., "^1.0.0")
  type: PluginType;
  requiresPlaintext?: boolean;          // If true, plugin is disabled when encryption prevents plaintext access
  dependencies?: Record<string, string>; // Other plugin IDs + version ranges
  platforms?: ("web" | "desktop" | "mobile" | "cli")[]; // Default: all
  settings?: {
    schema: Record<string, unknown>;    // JSON Schema for settings
    defaults: Record<string, unknown>;
  };
}

export type PluginType =
  | "ai-provider"       // Custom AI completion/transcription provider
  | "editor-extension"  // CodeMirror 6 extensions
  | "sidebar-panel"     // Custom sidebar tab
  | "command"           // Command palette commands
  | "sync-handler"      // Custom sync/export integrations
  | "processor"         // Markdown/note processing pipeline
  | "integration"       // External service integration
  | "full";             // Unrestricted (uses multiple extension points)
```

### NoteSync Host Interface

```typescript
export interface NoteSync {
  readonly version: string;
  readonly platform: "web" | "desktop" | "mobile" | "cli";

  // Subsystem APIs (facades over internals — never expose Prisma/SQLite)
  readonly notes: NotesAPI;
  readonly providers: ProviderRegistry;
  readonly workspace: WorkspaceAPI;
  readonly commands: CommandRegistry;
  readonly settings: SettingsAPI;
  readonly hooks: HookRegistry;
  readonly events: EventBus;
  readonly services: ServiceRegistry;

  // Encryption state
  readonly encryption: EncryptionInfo;
}

export interface EncryptionInfo {
  /** Whether the user has E2E encryption enabled */
  readonly enabled: boolean;
  /** The user's privacy tier (null if encryption not enabled) */
  readonly tier: "relay" | "byok" | "none" | null;
  /** Whether this plugin has access to plaintext note content in its current context */
  readonly hasPlaintextAccess: boolean;
}
```

### NotesAPI (Note/Folder/Tag CRUD)

```typescript
export interface NotesAPI {
  // Notes
  listNotes(filter?: NoteFilter): Promise<NoteSummary[]>;
  getNote(id: string): Promise<Note | null>;
  getNoteByTitle(title: string): Promise<Note | null>;
  createNote(data: CreateNoteInput): Promise<Note>;
  updateNote(id: string, data: UpdateNoteInput): Promise<Note>;
  deleteNote(id: string): Promise<void>;

  // Folders
  listFolders(): Promise<FolderTree[]>;
  createFolder(name: string, parentId?: string): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;

  // Tags
  listTags(): Promise<Tag[]>;

  // Search
  search(query: string, mode?: "keyword" | "semantic" | "hybrid"): Promise<SearchResult[]>;

  // Backlinks
  getBacklinks(noteId: string): Promise<Backlink[]>;
}
```

**Encryption behavior:** When E2E encryption is enabled:
- **Client-side plugins:** `NotesAPI` returns decrypted content (client holds the master key). No change in behavior.
- **Server-side plugins (Server Relay):** `NotesAPI` returns metadata only (IDs, timestamps, folder names). Note content fields are `null` unless the client has explicitly sent decrypted content for a transient AI operation.
- **Server-side plugins (BYOK Direct / No AI):** Same as above — metadata only, no content access.

### ProviderRegistry (AI Provider Interfaces)

The host does NOT provide AI capabilities — plugins implement them. NoteSync defines **interfaces** that AI plugins register against. The host routes to whichever provider is active.

```typescript
export interface ProviderRegistry {
  /** Register an AI provider implementation */
  registerProvider<K extends keyof Providers>(type: K, provider: Providers[K]): void;

  /** Get the active provider for a type (null if none registered) */
  getProvider<K extends keyof Providers>(type: K): Providers[K] | null;

  /** Register an assistant tool (for the agentic AI loop) */
  registerTool(tool: AssistantTool): void;
}

/** Provider interfaces that plugins implement */
export interface Providers {
  completion: CompletionProvider;
  embedding: EmbeddingProvider;
  transcription: TranscriptionProvider;
  imageAnalysis: ImageAnalysisProvider;
}

export interface CompletionProvider {
  complete(prompt: string, options?: CompletionOptions): AsyncGenerator<string>;
  structureTranscript(transcript: string, mode: AudioMode): Promise<StructuredNote>;
}

export interface EmbeddingProvider {
  embedDocument(text: string): Promise<number[]>;
  embedQuery(text: string): Promise<number[]>;
  readonly dimensions: number;
}

export interface TranscriptionProvider {
  transcribe(audio: Buffer, filename: string): Promise<string>;
}

export interface ImageAnalysisProvider {
  analyze(imageBase64: string, mimeType: string): Promise<string>;
}
```

This is the key architectural decision: NoteSync defines **what AI capabilities look like** but doesn't provide them. First-party plugins (Whisper, Claude, Voyage) are the default implementations, included in the paid subscription. Community plugins can swap in any provider (OpenAI, Gemini, Deepgram, local models) with their own API keys.

## E2E Encryption & Plugins

### How Plugins Interact with Encrypted Data

Encryption affects server-side and client-side plugins differently:

**Client-side plugins** always have access to decrypted note content. The client holds the master key and decrypts notes before they reach the editor or any client plugin. From a client plugin's perspective, encryption is transparent — `NotesAPI` returns plaintext.

**Server-side plugins** cannot decrypt notes (the server never has the master key). Their access depends on the user's privacy tier:

| Privacy Tier | Server Plugin Access |
|---|---|
| No encryption | Full plaintext access (current behavior) |
| E2E + Server Relay | Transient plaintext for AI operations only (client sends decrypted content per-request, server discards after processing) |
| E2E + BYOK Direct | No plaintext access — ciphertext only |
| E2E + No AI | No plaintext access — ciphertext only |

### Manifest: `requiresPlaintext`

Plugins that need note content to function declare `requiresPlaintext: true` in their manifest. The plugin loader uses this to:

1. **Disable the plugin** when the user's encryption settings prevent plaintext access
2. **Show a message** in the plugin's settings: "This plugin requires access to note content and is disabled because E2E encryption is enabled with No AI mode."
3. **Allow the plugin** when the user is in Server Relay mode (transient plaintext is available)

Example:
- `plugin-transcription`: `requiresPlaintext: false` — transcription input is audio, not encrypted notes
- `plugin-ai-tools`: `requiresPlaintext: true` — tools read note content for search, summarize, etc.
- `plugin-embeddings`: `requiresPlaintext: true` — needs content to generate vectors
- `plugin-import-export`: `requiresPlaintext: false` on client (decrypts locally), `requiresPlaintext: true` on server

### Encrypted Plugin Storage

Plugins may store derived data (cached summaries, extracted entities, etc.). When encryption is enabled, this derived data should also be protected:

```typescript
export interface SettingsAPI {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;

  /** Store data encrypted with the user's key (client-side only).
      Returns null on server when encryption is enabled. */
  getEncrypted<T>(key: string): Promise<T | null>;
  setEncrypted<T>(key: string, value: T): Promise<void>;
}
```

`getEncrypted`/`setEncrypted` use the user's master key to encrypt plugin data at rest. This prevents derived data from leaking note content when the notes themselves are encrypted.

## Versioning Strategy

- `@notesync/plugin-api` follows semver strictly
- Minor versions add new APIs (non-breaking)
- Major versions may remove deprecated APIs
- Plugin manifests declare `hostApiVersion: "^1.0.0"` — the loader checks compatibility
- Deprecated APIs log warnings for one major version before removal
- Proposed/experimental APIs available via `host.experimental.featureName` (opt-in, may change)

## Tasks

- [ ] Create `packages/ns-plugin-api/` with package.json, tsconfig
- [ ] Define `Plugin`, `PluginManifest`, `NoteSync`, `EncryptionInfo` interfaces
- [ ] Define `NotesAPI`, `AIAPI`, `WorkspaceAPI`, `CommandRegistry`, `SettingsAPI`
- [ ] Define `HookRegistry`, `EventBus`, `ServiceRegistry`
- [ ] Define shared types (Note, Folder, Tag, SearchResult, etc.)
- [ ] Define `getEncrypted`/`setEncrypted` on SettingsAPI
- [ ] Publish to npm as `@notesync/plugin-api`
- [ ] Write API reference documentation
