# 08 — Shell Completions & Config

**Status:** Planned
**Phase:** 5 — Workflow Integration
**Priority:** Low

## Summary

Shell tab-completion for commands, note titles, folder names, and tags. User-configurable defaults.

## Shell Completions

```bash
ns completion bash >> ~/.bashrc            # Install bash completions
ns completion zsh >> ~/.zshrc              # Install zsh completions
ns completion fish >> ~/.config/fish/completions/ns.fish
```

**What completes:**
- Commands: `ns no<tab>` → `ns notes`
- Subcommands: `ns notes li<tab>` → `ns notes list`
- Flags: `ns notes list --fo<tab>` → `ns notes list --folder`
- Folder names: `ns notes list --folder Wo<tab>` → `ns notes list --folder Work`
- Note titles: `ns notes get "Pro<tab>` → `ns notes get "Project Plan"`
- Tag names: `ns notes list --tag mee<tab>` → `ns notes list --tag meeting`

Dynamic completions (folders, notes, tags) fetch from the API in real-time.

## Config

```bash
ns config set server https://ns-api.derekentringer.com
ns config set defaultFolder Work           # Default folder for new notes
ns config set defaultMode meeting          # Default transcription mode
ns config get server                       # Print current value
ns config list                             # Show all config
ns config reset                            # Reset to defaults
```

**Config file location:** `~/.config/notesync-cli/config.json` (XDG-compliant)

```json
{
  "server": "https://ns-api.derekentringer.com",
  "defaultFolder": null,
  "defaultMode": "memo",
  "defaultSort": "updatedAt",
  "pageSize": 10
}
```

## Update Notifications

On CLI startup (non-blocking), check for new versions:
```
╭─────────────────────────────────────────╮
│  Update available: 1.0.0 → 1.1.0       │
│  Run npm i -g @derekentringer/ns-cli    │
╰─────────────────────────────────────────╯
```

Uses `update-notifier` — checks once per day, non-blocking.

## Tasks

- [ ] Create `commands/config.ts` — set, get, list, reset
- [ ] Implement shell completion generators (bash, zsh, fish)
- [ ] Dynamic completions for note titles, folder names, tags
- [ ] Add `update-notifier` for version check
- [ ] Document installation in README
