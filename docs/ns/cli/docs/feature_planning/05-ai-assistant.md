# 05 — AI Assistant

**Status:** Planned
**Phase:** 3 — AI & Search
**Priority:** Medium

## Summary

AI-powered Q&A, summarization, and tag generation from the terminal. Responses stream to stdout in real-time (ChatGPT-like typing effect). Uses the same agentic tool system as the web/desktop chat.

## Commands

### Ask Questions
```bash
ns ask "What notes mention the Q3 budget?"             # Streams answer to stdout
ns ask "Summarize my Project Plan"                     # AI reads and summarizes
ns ask "What did I write about React this week?"       # Temporal queries
ns ask "List my favorite notes"                        # Uses search_notes tool
ns ask "What can you do?"                              # Self-awareness
```

**Streaming output**: Text streams character-by-character to stdout. Tool activity shown as dimmed status lines:

```
⠋ Searching notes matching "Q3 budget"...
Found 3 relevant notes. Based on your notes:

The Q3 budget was discussed in your "Finance Review" note from March 15...
```

### AI-Powered Note Actions
```bash
ns ask "Create a meeting agenda for the sprint review" --create    # Creates a note
ns ask "Fix the backlinks in my README"                           # Edits note content
ns ask "Tag my latest notes with appropriate tags"                # Bulk tagging
ns ask "Delete my old scratch notes"                              # Deletion (with confirmation)
```

### Summarize
```bash
ns summarize "Project Plan"                # Generate + save summary
ns summarize "Project Plan" --print        # Print summary without saving
```

### Generate Tags
```bash
ns gentags "Meeting Notes"                 # Suggest tags (prints, doesn't apply)
ns gentags "Meeting Notes" --apply         # Suggest and apply tags
```

## Tool Activity Display

When Claude uses tools, the CLI shows:
```
⠋ Searching favorite notes...
⠋ Reading "Project Plan"...
⠋ Updating "Project Plan"...

Done. Updated content of "Project Plan". The previous version is saved in version history.
```

## Piping

```bash
# Save AI answer to file
ns ask "Summarize all my meeting notes" > summary.txt

# Use in scripts
ANSWER=$(ns ask "How many notes do I have?" --quiet-tools)
echo "NoteSync says: $ANSWER"
```

## Tasks

- [ ] Create `commands/ai.ts` — `ns ask` with streaming SSE parsing
- [ ] Tool activity display (spinners with descriptions)
- [ ] Note card display in terminal (title, folder, tags)
- [ ] `--create` flag for ask → create note flow
- [ ] Create `ns summarize` subcommand
- [ ] Create `ns gentags` subcommand
- [ ] `--quiet-tools` flag to suppress tool activity output
