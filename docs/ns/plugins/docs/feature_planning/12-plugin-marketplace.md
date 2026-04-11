# 12 — Plugin Directory & Marketplace

**Status:** Planned
**Phase:** 5 — Ecosystem
**Priority:** Low

## Summary

A plugin directory where users can discover, install, and manage community plugins. Accessible from the Settings page in the app and via the CLI.

## Discovery

### In-App (Settings → Plugins)
- Browse featured/popular/new plugins
- Search by name, category, author
- One-click install/uninstall
- Plugin settings inline

### CLI
```bash
ns plugins search "kanban"
ns plugins install @notesync/plugin-kanban
ns plugins list                          # Installed plugins
ns plugins uninstall @notesync/plugin-kanban
ns plugins enable @notesync/plugin-kanban
ns plugins disable @notesync/plugin-kanban
```

### Web Directory
- Public website listing all approved plugins
- README rendering, screenshots, install stats
- Author profiles, version history, changelog

## Submission Process

1. Plugin author publishes to npm with `notesync` field in package.json
2. Author submits to the NoteSync plugin directory (GitHub PR or web form)
3. **Automated checks**: manifest validation, type checking, dependency audit, test suite passes
4. **Manual review**: Code review for security concerns (no malicious network calls, no data exfiltration)
5. Listed in directory with "Community" badge
6. "Verified" badge after extended use without issues

## Plugin Registry API

```
GET  /plugins/directory                  # List all approved plugins
GET  /plugins/directory/:id              # Plugin details
POST /plugins/install                    # Install for current user
POST /plugins/uninstall                  # Uninstall for current user
GET  /plugins/installed                  # User's installed plugins
PATCH /plugins/:id/settings             # Update plugin settings
```

## Tasks

- [ ] Design plugin directory API
- [ ] Build in-app plugin browser UI
- [ ] CLI plugin management commands
- [ ] Automated submission validation pipeline
- [ ] Plugin directory web page
- [ ] Review process documentation
