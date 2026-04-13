# NoteSync CLI — Progress

## Overview

Command-line interface for NoteSync. Connects directly to the NoteSync API server — works standalone without the web or desktop app. Enables quick capture, scripting, automation, and AI queries from the terminal.

## Tech Stack

- **Framework**: commander (subcommand support, auto-help)
- **Build**: tsup (ESM bundling via esbuild)
- **Dev runner**: tsx (run TypeScript directly)
- **Prompts**: @clack/prompts (interactive flows)
- **Colors**: picocolors (tiny, NO_COLOR compliant)
- **Spinners**: ora (non-interactive progress)
- **Tables**: cli-table3 (tabular output)
- **Config**: conf (XDG-compliant, typed)
- **Credentials**: OS keychain via keyring + config file fallback
- **HTTP**: Native fetch (Node 18+)
- **Distribution**: npm/npx (`@derekentringer/ns-cli`)

## Phases

### Phase 1 — Foundation

- [ ] [00 — Project Scaffolding](feature_planning/00-project-scaffolding.md)
- [ ] [01 — Authentication](feature_planning/01-auth.md)

### Phase 2 — Core Note Management

- [ ] [02 — Notes CRUD](feature_planning/02-notes-crud.md)
- [ ] [03 — Folders & Tags](feature_planning/03-folders-tags.md)

### Phase 3 — AI & Search

- [ ] [04 — Search](feature_planning/04-search.md)
- [ ] [05 — AI Assistant](feature_planning/05-ai-assistant.md)

### Phase 4 — Audio & Media

- [ ] [06 — Transcription](feature_planning/06-transcription.md)

### Phase 5 — Workflow Integration

- [ ] [07 — Import & Export](feature_planning/07-import-export.md)
- [ ] [08 — Shell Completions & Config](feature_planning/08-shell-completions.md)
