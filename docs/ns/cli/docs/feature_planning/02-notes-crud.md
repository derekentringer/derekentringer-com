# 02 — Notes CRUD

**Status:** Planned
**Phase:** 2 — Core Note Management
**Priority:** High

## Summary

Create, read, update, and delete notes from the command line. Support stdin piping, file reading, and multiple output formats.

## Commands

### List Notes
```bash
ns notes list                              # Recent notes (default sort: updatedAt desc)
ns notes list --folder Work                # Filter by folder name
ns notes list --tag meeting                # Filter by tag
ns notes list --favorite                   # Favorites only
ns notes list --sort title                 # Sort by title/createdAt/updatedAt
ns notes list --limit 20                   # Limit results (default: 10)
ns notes list --json                       # JSON output
```

**Default output**: Table with columns: Title, Folder, Tags, Updated

### Get Note Content
```bash
ns notes get "Project Plan"                # Print content to stdout (markdown)
ns notes get "Project Plan" --json         # Full note as JSON (id, title, content, tags, etc.)
ns notes get "Project Plan" --id abc-123   # Get by ID instead of title
```

### Create Note
```bash
ns notes create "Meeting Agenda"                              # Blank note
ns notes create "Meeting Agenda" --content "## Attendees"     # With content
ns notes create "Daily Log" --folder Work --tags daily,log    # With folder + tags
cat template.md | ns notes create "From Template" --stdin     # Content from stdin
ns notes create "From File" --file ./document.md              # Content from file
```

### Edit Note Content
```bash
ns notes edit "Project Plan" --content "new full content"     # Replace content
ns notes edit "Project Plan" --stdin                          # Content from stdin
ns notes edit "Project Plan" --file ./updated.md              # Content from file
ns notes edit "Project Plan" --append "## New Section"        # Append to existing
```

### Delete Note
```bash
ns notes delete "Old Draft"                # Soft delete (moves to trash)
ns notes delete "Old Draft" --confirm      # Skip confirmation prompt
```

### Move Note
```bash
ns notes move "Draft" --to "Work"          # Move to folder by name
ns notes move "Draft" --unfiled            # Remove from folder
```

### Tag Note
```bash
ns notes tag "Project Plan" --add important urgent     # Add tags
ns notes tag "Project Plan" --remove draft             # Remove tags
ns notes tag "Project Plan" --set meeting,notes        # Replace all tags
```

## Piping Examples

```bash
# Create note from clipboard
pbpaste | ns notes create "From Clipboard" --stdin

# Export note to file
ns notes get "Project Plan" > project-plan.md

# Pipe note content to another tool
ns notes get "README" | wc -w

# Create note from command output
git log --oneline -10 | ns notes create "Recent Commits" --stdin --folder Dev
```

## Tasks

- [ ] Create `commands/notes.ts` with all subcommands
- [ ] Implement `list` with table output + filters
- [ ] Implement `get` with stdout + JSON modes
- [ ] Implement `create` with content/stdin/file support
- [ ] Implement `edit` with content/stdin/file/append modes
- [ ] Implement `delete` with confirmation prompt
- [ ] Implement `move` and `tag`
- [ ] Add `--json` and `--quiet` flags to all commands
