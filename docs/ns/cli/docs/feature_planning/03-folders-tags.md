# 03 — Folders & Tags

**Status:** Planned
**Phase:** 2 — Core Note Management
**Priority:** Medium

## Summary

Manage folders and tags from the command line. Folder tree display, creation, deletion. Tag listing, renaming, deletion. Dashboard stats.

## Commands

### Folders
```bash
ns folders list                            # Tree view with note counts
ns folders create "Projects"               # Create top-level folder
ns folders create "Sub" --parent "Projects"  # Create nested folder
ns folders delete "Old Folder"             # Delete folder (notes become unfiled)
ns folders delete "Old Folder" --recursive # Delete folder + all notes inside
```

**Tree output example:**
```
- Work (5 notes)
  - Projects (3 notes)
  - Meetings (2 notes)
- Personal (8 notes)
- Archive (12 notes)
```

### Tags
```bash
ns tags list                               # All tags with usage counts
ns tags list --sort count                  # Sort by most used
ns tags rename old-name new-name           # Rename across all notes
ns tags delete unused-tag                  # Remove from all notes
```

### Stats
```bash
ns stats                                   # Summary statistics
ns stats --json                            # JSON output
```

**Default output:**
```
Notes:      42
Favorites:   5
Folders:     8
Tags:       15
Audio:       3
```

## Tasks

- [ ] Create `commands/folders.ts` — list (tree), create, delete
- [ ] Create `commands/tags.ts` — list, rename, delete
- [ ] Create `commands/stats.ts` — dashboard summary
- [ ] Tree rendering for folder hierarchy
