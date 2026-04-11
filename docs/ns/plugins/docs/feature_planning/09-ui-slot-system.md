# 09 — UI Slot System

**Status:** Planned
**Phase:** 3 — Client Plugin System
**Priority:** Medium

## Summary

React component injection system. Named "slots" in the component tree where plugins can mount UI. Follows the pattern used by Grafana and VS Code webviews.

## Slot Locations

Based on the existing NoteSync component hierarchy:

| Slot Name | Location | Use Case |
|---|---|---|
| `ribbon.actions` | Vertical ribbon strip | Custom action buttons |
| `toolbar.left` | Editor toolbar left side | Custom formatting buttons |
| `toolbar.right` | Editor toolbar right side | Custom view controls |
| `sidebar.tabs` | Sidebar tab bar | Custom sidebar panels |
| `sidebar.explorer.actions` | Explorer panel header | Custom explorer actions |
| `noteList.contextMenu` | Note right-click menu | Custom note actions |
| `noteList.row.badge` | Note list row | Custom badges/indicators |
| `editor.statusBar` | Below editor | Status info, word count plugins |
| `editor.gutter` | Editor left margin | Line annotations |
| `preview.footer` | Below markdown preview | Custom preview sections |
| `settings.sections` | Settings page | Plugin settings panels |
| `drawer.tabs` | Right drawer tab bar | Custom drawer panels |
| `chat.actions` | Above chat input | Custom chat actions |

## Implementation

```typescript
// SlotProvider wraps the app
<SlotProvider plugins={activePlugins}>
  <NotesPage />
</SlotProvider>

// Slot component renders registered components
function Slot({ name, props }: { name: string; props?: Record<string, unknown> }) {
  const slots = useContext(SlotContext);
  const components = slots.get(name) ?? [];
  return (
    <>
      {components.map(({ Component, pluginId }, i) => (
        <ErrorBoundary key={`${pluginId}-${i}`} fallback={null}>
          <Component {...props} />
        </ErrorBoundary>
      ))}
    </>
  );
}

// In layout:
<Ribbon>
  <NewNoteButton />
  <AudioButtons />
  <Slot name="ribbon.actions" />
  <SettingsButton />
</Ribbon>
```

## Error Isolation

Each slot component wrapped in `ErrorBoundary` — a crashing plugin component doesn't take down the host UI.

## Tasks

- [ ] Create `SlotContext` and `SlotProvider`
- [ ] Create `Slot` component with ErrorBoundary
- [ ] Add `<Slot>` components at all defined locations
- [ ] Plugin registration: `host.workspace.registerSlotComponent(slotName, Component)`
- [ ] Hot-reload support for development
