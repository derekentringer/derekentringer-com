# 00 — Project Scaffolding

**Status:** Planned
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Set up the `packages/ns-cli/` package with TypeScript, ESM, commander, and tsup build pipeline. Establish the entry point, command structure, and output utilities.

## Requirements

- **Package**: `@derekentringer/ns-cli` in the monorepo at `packages/ns-cli/`
- **Entry point**: `src/cli.ts` with `#!/usr/bin/env node` banner
- **Build**: tsup compiling to ESM, targeting Node 20+
- **Dev**: `tsx src/cli.ts` for local development
- **bin**: `ns` command globally installable via `npm i -g`

## Project Structure

```
packages/ns-cli/
  src/
    cli.ts              # Entry point, register all commands
    commands/
      auth.ts           # login, logout, whoami
      notes.ts          # list, create, get, edit, delete, move, tag, search
      folders.ts        # list, create, delete
      tags.ts           # list, rename, delete
      ai.ts             # ask, summarize, gentags
      transcribe.ts     # Audio transcription
      stats.ts          # Dashboard stats
    lib/
      api.ts            # API client (fetch + auth header injection)
      auth.ts           # Token storage + auto-refresh
      config.ts         # Config file management (~/.config/notesync-cli/)
      output.ts         # Table, JSON, streaming formatters
    types.ts            # Shared types
  tsup.config.ts
  package.json
  tsconfig.json
```

## Dependencies

```json
{
  "dependencies": {
    "commander": "^13.0.0",
    "picocolors": "^1.1.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.5",
    "@clack/prompts": "^0.8.0",
    "conf": "^13.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

## Output Utilities

Every command supports:
- **Default**: Human-readable text/tables (no color when piped, respects `NO_COLOR`)
- **`--json`**: Machine-readable JSON output for scripting
- **`--quiet`**: Suppress output, exit code only

```typescript
// lib/output.ts
export function output(data: unknown, opts: { json?: boolean; quiet?: boolean }) {
  if (opts.quiet) return;
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Human-readable format
  }
}
```

## Exit Codes

- `0` — Success
- `1` — General error
- `2` — Usage error (bad args)
- `3` — Authentication error

## Tasks

- [ ] Create `packages/ns-cli/` with package.json, tsconfig.json, tsup.config.ts
- [ ] Set up entry point `src/cli.ts` with commander program
- [ ] Create `lib/output.ts` with table/json/streaming formatters
- [ ] Create `lib/api.ts` with fetch wrapper
- [ ] Create `lib/config.ts` with conf setup
- [ ] Add `ns --version` and `ns --help`
- [ ] Add to turbo.json for build/type-check
- [ ] Verify `npx tsx src/cli.ts --help` works locally
