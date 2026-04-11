# 13 — Security & Sandboxing

**Status:** Planned
**Phase:** 5 — Ecosystem
**Priority:** Low (only needed when accepting third-party plugins)

## Summary

Security model for running untrusted third-party plugins. Not needed for first-party plugins (which run in-process for performance). Only implement when the community plugin ecosystem reaches the point where untrusted code needs isolation.

## Threat Model

| Threat | Impact | Mitigation |
|---|---|---|
| Data exfiltration | Plugin sends user data to external server | Network policy + code review |
| Data corruption | Plugin modifies/deletes notes maliciously | Permission system + undo |
| Resource exhaustion | Plugin consumes CPU/memory/disk | Resource limits + timeouts |
| Privilege escalation | Plugin accesses other users' data | API scoped to `userId` (already enforced) |
| Supply chain | Malicious npm dependency | Dependency audit + lockfile |

## Server-Side Sandboxing

### Option A: `isolated-vm` (Recommended)

V8 isolate with explicit memory limit and timeout. Plugin code runs in a separate V8 context with no access to Node.js APIs.

```typescript
import ivm from "isolated-vm";

const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128 MB
const context = await isolate.createContext();

// Inject the plugin API (only safe subset)
await context.global.set("vault", new ivm.Reference(sandboxedVaultAPI));

// Run plugin code with timeout
const script = await isolate.compileScript(pluginCode);
await script.run(context, { timeout: 5000 }); // 5s timeout
```

### Option B: Worker Threads

Node.js Worker Thread per plugin. Full process isolation but higher overhead.

### Option C: WASM (Future)

Compile plugins to WASM for near-native sandboxing. Requires plugin authors to use compatible languages or toolchains.

## Client-Side Sandboxing

### Iframe Sandbox

Untrusted UI plugins render in a sandboxed iframe:

```html
<iframe
  sandbox="allow-scripts"
  src="/plugins/untrusted/my-plugin/index.html"
  style="border: none; width: 100%; height: 100%;"
/>
```

Communication via `postMessage` with a restricted API:

```typescript
// Host → Plugin
iframe.contentWindow.postMessage({ type: "note:data", note }, "*");

// Plugin → Host
window.addEventListener("message", (event) => {
  if (event.data.type === "vault:createNote") {
    // Validate and execute
  }
});
```

## Permission System

Plugins declare required permissions in manifest:

```json
{
  "permissions": [
    "vault:read",          // Read notes, folders, tags
    "vault:write",         // Create/update/delete notes
    "vault:delete",        // Specifically delete notes
    "ai:complete",         // Use AI completions
    "ai:embed",            // Generate embeddings
    "network:fetch",       // Make outbound HTTP requests
    "ui:sidebar",          // Register sidebar panels
    "ui:editor"            // Register editor extensions
  ]
}
```

Users see permission requests on install (like mobile app permissions).

## When to Implement

**Don't implement sandboxing until:**
1. There are third-party plugin developers submitting plugins
2. The plugin API is stable (v1.0+)
3. There's a review process in place

**Start with:** Code review + automated security scanning (Phase 5). Only add runtime sandboxing if the ecosystem grows large enough that manual review becomes insufficient.

## Tasks

- [ ] Define permission types in plugin-api
- [ ] Permission declaration in manifest
- [ ] Permission prompt UI on install
- [ ] `isolated-vm` integration for server-side sandboxing
- [ ] Iframe sandbox for client-side untrusted UI
- [ ] Resource limits (memory, CPU, timeout)
- [ ] Automated security scanning in submission pipeline
