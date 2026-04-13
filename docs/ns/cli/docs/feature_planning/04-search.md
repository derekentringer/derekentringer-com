# 04 — Search

**Status:** Planned
**Phase:** 3 — AI & Search
**Priority:** Medium

## Summary

Search notes by keyword, semantic similarity, or hybrid mode. Results displayed as a table or JSON.

## Commands

```bash
ns notes search "React architecture"                   # Keyword search (default)
ns notes search "React" --mode semantic                # Semantic search (pgvector)
ns notes search "React" --mode hybrid                  # Hybrid (keyword + semantic)
ns notes search "meeting" --folder Work                # Search within folder
ns notes search "budget" --tag finance                 # Search within tag
ns notes search "project" --limit 20                   # More results
ns notes search "React architecture" --json            # JSON output
```

**Default output**: Table with Title, Folder, Snippet (highlighted match), Updated

**Piping example:**
```bash
# Search and open first result in the app
ns notes search "project plan" --json | jq -r '.[0].id'

# Count notes matching a term
ns notes search "meeting" --json | jq length
```

## Tasks

- [ ] Add `search` subcommand to `commands/notes.ts`
- [ ] Support `--mode` flag (keyword, semantic, hybrid)
- [ ] Support `--folder` and `--tag` filters
- [ ] Display search snippets/headlines in output
- [ ] JSON output with full note data
