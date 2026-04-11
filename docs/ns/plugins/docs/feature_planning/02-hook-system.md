# 02 — Hook System

**Status:** Planned
**Phase:** 1 — Plugin API Foundation
**Priority:** High

## Summary

Typed hook system that allows plugins to intercept and extend NoteSync operations. Three types: events (fire-and-forget notifications), hooks (interceptable operations), and middleware (data transformation chains).

## Hook Types

### Events (fire-and-forget)

Notifications after something happened. Plugins can react but not block.

```typescript
interface EventBus {
  on<K extends keyof NsEvents>(event: K, handler: NsEvents[K]): void;
  off<K extends keyof NsEvents>(event: K, handler: NsEvents[K]): void;
  emit<K extends keyof NsEvents>(event: K, ...args: Parameters<NsEvents[K]>): void;
}

interface NsEvents {
  "note:created": (note: Note) => void;
  "note:updated": (note: Note, changes: Partial<Note>) => void;
  "note:deleted": (noteId: string) => void;
  "folder:created": (folder: Folder) => void;
  "folder:deleted": (folderId: string) => void;
  "sync:push": (changes: SyncChange[]) => void;
  "sync:pull": (changes: SyncChange[]) => void;
  "recording:started": (mode: AudioMode) => void;
  "recording:stopped": (noteId: string) => void;
  "chat:message": (message: ChatMessage) => void;
}
```

### Hooks (interceptable)

Operations that plugins can modify or cancel. Async, sequential execution.

```typescript
interface HookRegistry {
  tap<K extends keyof NsHooks>(hook: K, handler: NsHooks[K]): void;
}

interface NsHooks {
  /** Return false to cancel the save */
  "before:note:save": (note: Note) => Promise<boolean | void>;
  "after:note:save": (note: Note) => Promise<void>;

  /** Return false to cancel deletion */
  "before:note:delete": (noteId: string) => Promise<boolean | void>;

  /** Modify transcript before structuring */
  "before:transcribe:structure": (transcript: string, mode: AudioMode) => Promise<string>;

  /** Modify structured note before saving */
  "after:transcribe:structure": (result: StructuredNote) => Promise<StructuredNote>;

  /** Modify AI prompt before sending */
  "before:ai:complete": (prompt: string, context: AIContext) => Promise<string>;

  /** Modify AI response before displaying */
  "after:ai:complete": (response: string, context: AIContext) => Promise<string>;

  /** Modify note content before rendering preview */
  "before:render:preview": (content: string, noteId: string) => Promise<string>;

  /** Modify sync changes before pushing */
  "before:sync:push": (changes: SyncChange[]) => Promise<SyncChange[]>;
}
```

### Middleware (data transformation)

Chainable transformations for pipelines like markdown rendering or AI enrichment.

```typescript
type Middleware<T> = (data: T, next: () => Promise<T>) => Promise<T>;

interface MiddlewareRegistry {
  use<K extends keyof NsMiddleware>(chain: K, middleware: NsMiddleware[K]): void;
}

interface NsMiddleware {
  "markdown:render": Middleware<{ html: string; noteId: string }>;
  "ai:context": Middleware<{ noteContexts: NoteContext[]; question: string }>;
  "search:results": Middleware<{ results: SearchResult[]; query: string }>;
}
```

## Auto-Cleanup

All hooks registered by a plugin are automatically removed on `deactivate()`. Plugins don't need manual cleanup — mirrors Obsidian's `Component` pattern.

```typescript
// Internally, the host tracks registrations per plugin
class PluginHost implements NoteSync {
  private registrations: (() => void)[] = [];

  tap(hook, handler) {
    const unsub = this.hooks.tap(hook, handler);
    this.registrations.push(unsub);
  }

  // Called during deactivate
  cleanup() {
    this.registrations.forEach(unsub => unsub());
  }
}
```

## Tasks

- [ ] Implement typed `EventBus` with `on`/`off`/`emit`
- [ ] Implement typed `HookRegistry` with `tap` and sequential async execution
- [ ] Implement `MiddlewareRegistry` with chainable `next()` pattern
- [ ] Auto-cleanup tracking per plugin instance
- [ ] Wire hooks into existing noteStore, aiService, syncEngine
- [ ] Add bail support for hooks (return `false` to cancel operation)
