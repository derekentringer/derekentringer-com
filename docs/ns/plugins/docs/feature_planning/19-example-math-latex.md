# 19 — Example Plugin: Math/LaTeX

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `processor`

## Summary

Renders LaTeX math expressions inline and in display blocks using KaTeX. Supports `$...$` for inline math and `$$...$$` for display math. Simple, focused plugin that's ideal as a "first plugin" example in developer documentation due to its small scope.

## Manifest

```json
{
  "id": "notesync-math",
  "name": "Math/LaTeX",
  "version": "1.0.0",
  "description": "Render LaTeX math expressions with KaTeX",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "processor",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "mobile"],
  "settings": {
    "schema": {
      "displayMode": { "type": "boolean", "description": "Use display mode for $$ blocks" },
      "throwOnError": { "type": "boolean", "description": "Show errors for invalid LaTeX" }
    },
    "defaults": {
      "displayMode": true,
      "throwOnError": false
    }
  }
}
```

## Markdown Syntax

```markdown
The quadratic formula is $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ which solves any quadratic.

$$
\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

Einstein's famous equation: $E = mc^2$
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";
import katex from "katex";

export default class MathPlugin implements Plugin {
  manifest = require("./manifest.json");

  register(host: NoteSync) {
    // Register markdown render middleware
    host.hooks.use("markdown:render", async (data, next) => {
      const settings = await host.settings.get<{
        displayMode: boolean;
        throwOnError: boolean;
      }>("settings");

      // Render display math first ($$...$$) to avoid matching inline ($...$) inside
      data.html = data.html.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_, tex) => {
          try {
            return katex.renderToString(tex.trim(), {
              displayMode: settings?.displayMode ?? true,
              throwOnError: settings?.throwOnError ?? false,
            });
          } catch (e) {
            return `<span class="math-error" title="${e}">${tex}</span>`;
          }
        }
      );

      // Render inline math ($...$)
      data.html = data.html.replace(
        /\$([^\$\n]+?)\$/g,
        (_, tex) => {
          try {
            return katex.renderToString(tex.trim(), {
              displayMode: false,
              throwOnError: settings?.throwOnError ?? false,
            });
          } catch (e) {
            return `<span class="math-error" title="${e}">${tex}</span>`;
          }
        }
      );

      return next();
    });

    // Register CodeMirror extension for syntax highlighting
    host.workspace.registerEditorExtension({
      id: "math-highlight",
      extension: mathHighlightExtension(),
    });
  }

  async activate() {}
  async deactivate() {}
}

// Minimal CodeMirror extension to highlight math delimiters
function mathHighlightExtension() {
  // ViewPlugin that adds decorations for $ and $$ delimiters
  // Gives visual feedback that math will be rendered in preview
  return [];  // Implementation uses @codemirror/view Decoration.mark
}
```

## Dependencies

- `katex` — KaTeX rendering library (~300KB, includes fonts)
- KaTeX CSS — loaded via plugin's style injection

```typescript
// In activate(), inject KaTeX CSS
async activate(host: NoteSync) {
  host.workspace.injectCSS("katex", katexCSS);
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.hooks.use("markdown:render", ...)` | Middleware chain for preview rendering |
| `host.workspace.registerEditorExtension()` | CodeMirror syntax highlighting for math |
| `host.workspace.injectCSS()` | Runtime CSS injection for KaTeX fonts |
| `host.settings.get()` | Display mode and error handling config |
| Middleware `next()` pattern | Plays nicely with other render plugins |

## Why This Is a Good First Plugin Example

- **Small scope** — one file, one dependency, one middleware hook
- **No state management** — pure transformation (input HTML → output HTML with rendered math)
- **No API calls** — everything runs client-side
- **Immediately visible** — type `$E = mc^2$` and see it render
- **Demonstrates the middleware chain** — shows how multiple render plugins compose via `next()`

## E2E Encryption Compatibility

- `requiresPlaintext: false` — pure client-side rendering, works with decrypted content in the editor
- Works in all encryption tiers

## Tasks

- [ ] Create `packages/ns-plugin-math/`
- [ ] Implement markdown:render middleware with KaTeX
- [ ] Handle display math ($$) and inline math ($) separately
- [ ] Error handling for invalid LaTeX
- [ ] CodeMirror extension for delimiter highlighting
- [ ] KaTeX CSS injection
- [ ] Tests: inline rendering, display rendering, error cases, nested delimiters
