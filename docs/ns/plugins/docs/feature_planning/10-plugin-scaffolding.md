# 10 — Plugin Scaffolding CLI

**Status:** Planned
**Phase:** 4 — Developer Experience
**Priority:** Low

## Summary

`npx create-notesync-plugin` generates a plugin project with TypeScript, build config, manifest, and test harness. Lowers the barrier for community plugin development.

## Usage

```bash
npx create-notesync-plugin my-plugin
# or
npx create-notesync-plugin my-plugin --type ai-provider
```

Interactive prompts:
```
◆ Plugin name: my-awesome-plugin
◆ Description: Adds Kanban board support
◆ Plugin type: editor-extension
◆ Platforms: web, desktop
◆ Author: Your Name
◆ Include server component? Yes
◆ Include client component? Yes

✓ Created my-awesome-plugin/
  - package.json
  - tsconfig.json
  - tsup.config.ts
  - src/index.ts (plugin entry)
  - src/manifest.json
  - src/__tests__/plugin.test.ts
  - README.md
```

## Generated Structure

```
my-awesome-plugin/
  src/
    index.ts              # Plugin class skeleton
    manifest.json         # Pre-filled manifest
    server/               # (if server component)
      routes.ts
    client/               # (if client component)
      Panel.tsx
    __tests__/
      plugin.test.ts      # Test with mock host
  package.json            # @notesync/plugin-api as devDependency
  tsconfig.json
  tsup.config.ts
  README.md               # Usage instructions + API reference links
```

## Tasks

- [ ] Create `create-notesync-plugin` npm package
- [ ] Interactive prompts via @clack/prompts
- [ ] Templates for each plugin type
- [ ] Generate test file with mock host
- [ ] README with links to plugin API docs
