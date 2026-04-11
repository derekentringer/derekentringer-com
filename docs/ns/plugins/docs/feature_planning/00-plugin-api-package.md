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
    vault.ts              # VaultAPI — note/folder/tag CRUD
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
  readonly vault: VaultAPI;
  readonly providers: ProviderRegistry;
  readonly workspace: WorkspaceAPI;
  readonly commands: CommandRegistry;
  readonly settings: SettingsAPI;
  readonly hooks: HookRegistry;
  readonly events: EventBus;
  readonly services: ServiceRegistry;
}
```

### VaultAPI (Note/Folder/Tag CRUD)

```typescript
export interface VaultAPI {
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

This is the key architectural decision: NoteSync defines **what AI capabilities look like** but doesn't provide them. First-party plugins (Whisper, Claude, Voyage) are the default implementations, included in paid tiers. Community plugins can swap in any provider (OpenAI, Gemini, Deepgram, local models) with their own API keys. NoteSync never subsidizes third-party AI costs.

## Versioning Strategy

- `@notesync/plugin-api` follows semver strictly
- Minor versions add new APIs (non-breaking)
- Major versions may remove deprecated APIs
- Plugin manifests declare `hostApiVersion: "^1.0.0"` — the loader checks compatibility
- Deprecated APIs log warnings for one major version before removal
- Proposed/experimental APIs available via `host.experimental.featureName` (opt-in, may change)

## Tasks

- [ ] Create `packages/ns-plugin-api/` with package.json, tsconfig
- [ ] Define `Plugin`, `PluginManifest`, `NoteSync` interfaces
- [ ] Define `VaultAPI`, `AIAPI`, `WorkspaceAPI`, `CommandRegistry`, `SettingsAPI`
- [ ] Define `HookRegistry`, `EventBus`, `ServiceRegistry`
- [ ] Define shared types (Note, Folder, Tag, SearchResult, etc.)
- [ ] Publish to npm as `@notesync/plugin-api`
- [ ] Write API reference documentation
