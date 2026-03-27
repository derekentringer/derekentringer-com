# 03 — Search & Organization

**Status:** Complete — See [features/03-search-and-organization.md](../features/03-search-and-organization.md)
**Phase:** 2 — Organization & Sync
**Priority:** High
**Completed:** v1.93.29

## Summary

This feature has been implemented. See the [completed feature doc](../features/03-search-and-organization.md) for full details.

### What Was Delivered

1. **Removed Search tab** — reduced to 4 bottom tabs (Dashboard, Notes, AI, Settings)
2. **Trash management** — accessible from Settings; view trashed notes, restore, permanent delete, empty trash with swipe actions
3. **Folder management** — create, rename, delete folders from the FolderPicker via long-press and action buttons

### What Was Deferred

- **FTS5 local search** — deferred to Feature 04 (Sync Engine) since it requires local SQLite data
- **Tag browsing** — deferred; API-based tag filtering already works in the Notes tab
- **Semantic search** — deferred to Feature 05 (AI Features)

## Original Requirements

- **Search**: Full-text search via SQLite FTS5 → **Deferred to Feature 04**
- **Folder browsing**: Folder list, nested folders, counts → **Already in Feature 01**
- **Tag browsing**: Tag cloud/list, multi-tag filtering → **Deferred**
- **Sort & filter**: Sort by title/created/modified → **Already in Feature 01**
- **Trash**: Soft-deleted notes, restore, permanent delete, empty → **Complete**
- **Folder management**: Create, rename, delete from mobile → **Complete**

## Open Questions (Resolved)

- ~~Should search also hit the API for semantic results when online?~~ → API search already works; local FTS5 will supplement in Feature 04
- ~~Folder management on mobile, or only from desktop/web?~~ → Added to mobile in FolderPicker
- ~~Should recent searches be saved?~~ → Deferred
