# 08 — Client Plugin Manager

**Status:** Planned
**Phase:** 3 — Client Plugin System
**Priority:** Medium

## Summary

Plugin discovery, loading, and lifecycle management on the client (web, desktop, mobile). Client plugins are ES modules loaded dynamically. They share the host's React instance and register into UI extension points.

## Discovery

Client plugins are declared server-side (the API returns a list of active plugins for the user). The client fetches the plugin manifest and loads the client-side module.

```typescript
// GET /plugins/active → [{ id, manifest, clientUrl }]
```

## Loading

```typescript
// Dynamic import of plugin's client module
const pluginModule = await import(/* @vite-ignore */ plugin.clientUrl);
const pluginInstance = new pluginModule.default();
pluginInstance.register(clientHost);
await pluginInstance.activate(clientHost);
```

Plugins share the host's React/ReactDOM via `externals` in their build config — no React version conflicts.

## Client Host Interface

```typescript
interface ClientNoteSync extends NoteSync {
  readonly workspace: ClientWorkspaceAPI;
}

interface ClientWorkspaceAPI {
  /** Register a component into a named UI slot */
  registerSlotComponent(slot: string, component: React.ComponentType): void;

  /** Register a sidebar tab */
  registerSidebarTab(tab: SidebarTabDefinition): void;

  /** Register a ribbon action button */
  registerRibbonAction(action: RibbonActionDefinition): void;

  /** Register a context menu item */
  registerContextMenuItem(item: ContextMenuDefinition): void;

  /** Register an editor extension (CodeMirror 6) */
  registerEditorExtension(extension: Extension): void;

  /** Register a markdown post-processor */
  registerMarkdownPostProcessor(processor: MarkdownPostProcessor): void;

  /** Get the currently selected note */
  getActiveNote(): Note | null;

  /** Navigate to a note */
  openNote(noteId: string): void;
}
```

## Platform Differences

| Feature | Web | Desktop | Mobile | CLI |
|---|---|---|---|---|
| UI slots | Yes | Yes | Limited | No |
| Editor extensions | Yes | Yes | No | No |
| Sidebar tabs | Yes | Yes | Yes (bottom sheet) | No |
| Commands | Yes | Yes | Yes | Yes |
| Ribbon actions | Yes | Yes | No | No |
| Background processing | ServiceWorker | Rust plugin | Background tasks | Process |

Plugins declare `platforms` in manifest to indicate which platforms they support.

## Tasks

- [ ] Create `PluginManager` class for client
- [ ] Implement dynamic ES module loading
- [ ] Create `ClientNoteSync` host implementation
- [ ] Implement plugin list fetch from API
- [ ] Handle plugin load errors gracefully
- [ ] Plugin enable/disable UI in Settings
