# 01 — Server Plugin Loader

**Status:** Planned
**Phase:** 1 — Plugin API Foundation
**Priority:** High

## Summary

Plugin discovery, loading, and lifecycle management on the ns-api server. Leverages Fastify's existing plugin system for route/hook registration within encapsulated contexts.

## Discovery

Plugins discovered from two sources:

1. **Built-in plugins**: `packages/ns-api/src/plugins/` directory (internal, always loaded)
2. **Installed plugins**: npm packages with a `notesync` field in package.json

```json
{
  "name": "@notesync/plugin-transcription",
  "notesync": {
    "type": "ai-provider",
    "apiVersion": "^1.0.0",
    "server": "./dist/server.js"
  }
}
```

Discovery scans `node_modules` for packages matching the `notesync` field pattern.

## Lifecycle

```
discover → validate manifest → check compatibility → register → activate → (running) → deactivate → unload
```

### Load Order

1. Parse all manifests
2. Build dependency graph
3. Topological sort (dependencies load first)
4. Circular dependency detection (reject with error)
5. Load in order: `register()` phase (all plugins), then `activate()` phase (all plugins)

### Registration in Fastify

Each plugin gets its own encapsulated Fastify context:

```typescript
// In app.ts plugin loader
for (const plugin of loadedPlugins) {
  fastify.register(async (pluginFastify) => {
    const host = createPluginHost(pluginFastify, plugin.manifest);
    plugin.register(host);
    await plugin.activate(host);
  }, { prefix: `/plugins/${plugin.manifest.id}` });
}
```

This gives each plugin:
- Its own route namespace (`/plugins/<id>/...`)
- Its own hooks (don't pollute other plugins)
- Access to shared decorators (database, auth, SSE hub)

## Plugin Data Storage

Each plugin gets a `plugin_data` JSON column in a `plugin_storage` table:

```sql
CREATE TABLE plugin_storage (
  plugin_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (plugin_id, user_id)
);
```

Accessed via `host.settings.load()` / `host.settings.save()`.

## Error Handling

- Plugin load failure doesn't crash the server — log error, skip plugin
- Plugin runtime errors caught at hook/route boundaries
- Health endpoint reports plugin status

## Tasks

- [ ] Create `PluginLoader` class in ns-api
- [ ] Implement npm package discovery (scan for `notesync` field)
- [ ] Implement built-in plugin directory loading
- [ ] Dependency resolution with topological sort
- [ ] Fastify encapsulated context per plugin
- [ ] Plugin data storage table + migration
- [ ] Error isolation (catch + log, don't crash)
- [ ] Plugin health reporting on `/health` endpoint
