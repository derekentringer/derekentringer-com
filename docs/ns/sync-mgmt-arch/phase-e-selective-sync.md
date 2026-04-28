# Phase E — Selective / Windowed Sync

**Goal**: make NoteSync viable on devices with limited disk, slow
networks, or huge libraries by syncing less than 100% of the user's
data by default.

This is the most ambitious phase. It touches the local storage shape,
the pull-side query, and several UI surfaces. Phase A's progress
visibility and Phase D's health panel make it debuggable; ship those
first.

## Problem

Today every signed-in device pulls every note's full content into
local SQLite. For a power user with 20k+ notes:

- Initial sync takes minutes-to-hours
- Local DB size grows to hundreds of MB (some notes are large)
- Mobile devices may not have the disk
- A user's "active" working set is usually a tiny fraction of the
  total, so most of that data is dead weight

## Two complementary mechanisms

### Mechanism 1: Sync window

Default behavior: only fully sync notes modified in the last N
months (default 6, user-configurable, with `Forever` as opt-out).
Notes outside the window are still represented locally (id, title,
folder, tags, updatedAt) so search and folder navigation work — but
their `content` and `summary` are null. Opening one triggers a
"fetching…" state that pulls the full content on demand.

Trade-off: search over body content for notes outside the window
falls back to server-side search rather than local FTS. Tolerable
for most users; advertised in settings as "older notes search
online."

### Mechanism 2: Per-folder offline opt-in

User can mark a folder as "available offline" or "cloud-only".
Offline folders sync content fully regardless of window. Cloud-only
folders sync metadata only; content fetched on demand.

Combination: default window applies to everything, plus user
overrides per-folder for fine-grained control.

## Implementation outline

### 1. Server pull-side filter

`/sync/pull` accepts a new `mode` parameter:

```
mode=full                    // current behavior (default for now)
mode=windowed&since=ISO      // metadata for everything; content only since the date
mode=selective&folders=A,B   // metadata for everything; content only for these folder ids
```

`windowed` and `selective` can be combined. The server filters at
query time — simpler than caching projections. Cost: one extra
indexed query per pull batch.

### 2. Local storage shape

Two options:

- **Same notes table, nullable content/summary.** Simple. Search
  must check `content IS NOT NULL` before falling back to network.
- **Two tables: `notes` and `notes_meta`.** Cleaner separation,
  bigger migration cost.

Recommend the first — start simple, refactor only if it gets messy.

### 3. Lazy content fetch

When the user opens a metadata-only note, fire a `/notes/:id` GET to
hydrate content + summary. Cache locally going forward (the note now
has content, treated as if it were in the window).

### 4. Settings UI

`Settings → Sync` (new section):

- Default sync window: dropdown (1mo / 3mo / 6mo / 1yr / Forever)
- Per-folder: a "Available offline" toggle on each folder in the
  folder tree (or in folder context menu)
- Disk usage estimate: "Currently syncing 8,432 of 20,107 notes
  (full content for ~8,432, metadata for 11,675)"

### 5. Search adaptation

Local FTS5 only covers locally-resident content. Searches that go
beyond the window need a `mode=hybrid&network=true` flag to fall
back to a server search call when no local match. Already exists for
semantic search; extend the same pattern.

## Done criteria

- New install on a 20k-note account completes initial metadata sync
  in under 30 seconds
- Local DB after initial sync is <10% of full-sync size for the same
  account
- Opening an out-of-window note shows a brief "loading…" then the
  content
- Folder tree, recents, favorites, and tag listings all work
  correctly with mostly-metadata local state
- Search degrades gracefully: local-first, falls back to server for
  out-of-window matches

## Out of scope

- Lossy local representation of large notes (excerpting) — too clever
- Fully cloud-only mode (no local store at all) — out of scope; keep
  offline-first as the default
- Different sync windows per device profile — overkill

## Risks / open questions

- **Wiki-link resolution.** Wiki-links to out-of-window notes need
  to resolve their target's title and id even without content.
  Already true with the metadata-only model, but worth testing.
- **Sync of an existing user's library.** Migration from "all
  content" to "windowed" needs to be opt-in. Don't auto-evict body
  content from local without explicit user action.
- **Cross-device consistency.** If device A is windowed and device B
  is full, edits to an out-of-window note on B propagate via push;
  device A pulls the update as metadata-only unless the user opens
  it. Needs a thoughtful UX for "something changed but isn't in your
  window" notifications.
- **Backlinks panel.** Backlinks may reference notes outside the
  window — the panel needs to lazy-fetch or show metadata-only
  entries.
