# NoteSync Desktop — Build Reference

Current, authoritative reference for building the Tauri desktop app on macOS and Windows. If something here contradicts an older feature doc, this file wins.

All commands run from `packages/ns-desktop/` unless noted.

---

## Build Matrix

| Script | Platform | API Target | Version Label | Signing | Output Bundles |
|---|---|---|---|---|---|
| `npm run dev` | macOS + Windows | `http://localhost:3004` | from `tauri.conf.json` | n/a | none (hot-reload dev shell) |
| `npm run tauri:build` | macOS | `http://localhost:3004` | `<tag>-0` | ad-hoc | `.app`, `.dmg` |
| `npm run tauri:build:win` | Windows | `http://localhost:3004` | `<tag>-0` | unsigned | `.msi`, `.exe` (NSIS) |
| `npm run tauri:build:prod` | macOS | `https://ns-api.derekentringer.com` | `<tag>` | ad-hoc | `.app`, `.dmg` (universal) |
| `npm run tauri:build:prod:win` | Windows | `https://ns-api.derekentringer.com` | `<tag>` | unsigned | `.msi`, `.exe` (NSIS) |

`<tag>` = latest git tag with leading `v` stripped, e.g. `v2.25.0` → `2.25.0`.

**Local vs prod is decided by which script you run, not by `.env` files.** All build scripts set `VITE_API_URL` explicitly via `cross-env` so the baked-in URL does not depend on any gitignored env file. This is the fix for the class of "local build silently hit prod" bugs.

---

## Script Internals

### Current `package.json` scripts

```json
"dev": "tauri dev",
"tauri:build": "npm run tauri:version-sync:dev && cross-env VITE_API_URL=http://localhost:3004 tauri build",
"tauri:build:win": "npm run tauri:version-sync:dev && cross-env VITE_API_URL=http://localhost:3004 tauri build",
"tauri:build:prod": "npm run tauri:version-sync && npm run tauri:clear-cache && APPLE_SIGNING_IDENTITY=- VITE_API_URL=https://ns-api.derekentringer.com tauri build --target universal-apple-darwin",
"tauri:build:prod:win": "npm run tauri:version-sync && cross-env VITE_API_URL=https://ns-api.derekentringer.com tauri build",
"tauri:version-sync": "node -e \"...writes <tag> to tauri.conf.json\"",
"tauri:version-sync:dev": "node -e \"...writes <tag>-0 to tauri.conf.json\""
```

### Flow of a `tauri build`

1. **Version sync** — `tauri:version-sync` or `tauri:version-sync:dev` runs first, reads `git describe --tags --abbrev=0`, strips the `v`, and rewrites `src-tauri/tauri.conf.json`'s `version` field. The `:dev` variant appends `-0` (see "Pre-release suffix" below).
2. **Cache clear** (macOS prod only) — `tauri:clear-cache` removes WebKit cache so the built app starts clean.
3. **`tauri build` invocation** — Tauri runs the `beforeBuildCommand` from `tauri.conf.json`, which is `npm run vite:build` → `node scripts/generate-release-notes.mjs && vite build`. Vite runs in production mode by default, but the inline `VITE_API_URL=...` set by the parent script overrides any `.env.production` value.
4. **Rust compile** — `cargo build --release` produces `src-tauri/target/release/NoteSync.exe` (Windows) or the macOS binary under `target/universal-apple-darwin/release/` (macOS prod) / `target/release/` (macOS dev).
5. **Bundler** — Tauri's bundler wraps the binary into platform installers:
   - macOS → `.app` + `.dmg`
   - Windows → `.msi` (via WiX `candle` + `light`) and `-setup.exe` (via NSIS `makensis`)

### Why `cross-env` on every script

On macOS, npm runs scripts via `sh`, so `FOO=bar cmd` inline prefixes work. On Windows, npm uses `cmd.exe`, which treats `FOO=bar` as a command name and errors with `'FOO' is not recognized`. `cross-env` normalizes this across platforms. All four build scripts use `cross-env` so the shapes stay identical.

---

## Environment Variable Precedence

For the `VITE_API_URL` specifically, Vite resolves env vars with the following priority (highest first):

1. **Inline via `cross-env`** — set by the build scripts. Always wins.
2. `.env.production.local` (gitignored by convention)
3. `.env.production` (gitignored in this repo)
4. `.env.local` (gitignored by convention)
5. `.env` (gitignored in this repo)

**Rule:** because every build script passes `VITE_API_URL` explicitly, the `.env*` files are effectively only used by `npm run dev` (dev mode loads `.env` and `.env.development`, not `.env.production`). If you edit `.env.production` manually, it has **no effect** on the packaged builds.

### What each env file is for

| File | Loaded when | Purpose |
|---|---|---|
| `.env` | `npm run dev` (and `vite build` unless overridden) | Local dev default (`VITE_API_URL=http://localhost:3004`) |
| `.env.production` | `vite build` (prod mode) unless overridden | Historical artifact — not relied on by current scripts |
| `.env.example` | never | Template checked into git so new devs know what to copy |

These files are per-machine and gitignored. Two machines may disagree on contents — **this must not matter** for packaged builds, and the explicit `cross-env` in scripts enforces that.

---

## Pre-release Version Suffix (`-0`)

Local packaged builds use `tauri:version-sync:dev`, which appends `-0` to the version string (e.g. `2.25.0-0`). Prod builds use `tauri:version-sync` with no suffix (`2.25.0`).

**Why `-0` and not `-dev`:** the Windows MSI bundler requires the SemVer pre-release identifier to be numeric only and ≤ 65535. `-dev` causes `optional pre-release identifier in app version must be numeric-only and cannot be greater than 65535 for msi target`. `-0` satisfies the constraint while still being visually distinct from prod. This is a Windows MSI restriction — macOS builds would accept `-dev`, but we use `-0` on both platforms for script parity.

---

## Output Locations

All paths relative to `packages/ns-desktop/`.

### macOS

| Build | Binary | Bundle |
|---|---|---|
| `tauri:build` (local) | `src-tauri/target/release/NoteSync.app/Contents/MacOS/NoteSync` | `src-tauri/target/release/bundle/macos/NoteSync.app`, `.../dmg/NoteSync_<version>-0_x64.dmg` |
| `tauri:build:prod` | `src-tauri/target/universal-apple-darwin/release/NoteSync.app/Contents/MacOS/NoteSync` | `src-tauri/target/universal-apple-darwin/release/bundle/macos/NoteSync.app`, `.../dmg/NoteSync_<version>_universal.dmg` |

### Windows

| Build | Raw exe | MSI | NSIS |
|---|---|---|---|
| `tauri:build:win` (local) | `src-tauri/target/release/NoteSync.exe` | `src-tauri/target/release/bundle/msi/NoteSync_<version>-0_x64_en-US.msi` | `src-tauri/target/release/bundle/nsis/NoteSync_<version>-0_x64-setup.exe` |
| `tauri:build:prod:win` | `src-tauri/target/release/NoteSync.exe` | `src-tauri/target/release/bundle/msi/NoteSync_<version>_x64_en-US.msi` | `src-tauri/target/release/bundle/nsis/NoteSync_<version>_x64-setup.exe` |

**Important:** local and prod Windows builds share the same `src-tauri/target/release/` directory. The `NoteSync.exe` at the top level gets overwritten each time. The bundled MSI/NSIS files keep their own versioned filenames and are safe to coexist. If you need both versions side by side, copy the bundle files out between runs — don't rely on `target/release/NoteSync.exe` matching a specific bundle.

---

## Platform Differences Summary

| Concern | macOS | Windows |
|---|---|---|
| Script shell | `sh` (native inline env works) | `cmd.exe` (needs `cross-env`) |
| Code signing | Ad-hoc (`APPLE_SIGNING_IDENTITY=-`) — required for TCC permission persistence | Unsigned — SmartScreen shows "Unknown publisher" warning (acceptable for personal use) |
| Universal binary | Yes (`--target universal-apple-darwin`) on prod | No (x64 only) |
| Installer formats | `.app` (runnable) + `.dmg` (distribution) | `.exe` (raw binary) + `.msi` (WiX) + `-setup.exe` (NSIS) |
| MSI version constraint | n/a | Pre-release identifier must be numeric-only ≤ 65535 |
| WebKit cache clear | Needed on prod (`rm -rf ~/Library/Caches/...`) | Not needed |
| Required toolchain | Xcode CLT, `iconutil` (icons) | MSVC Build Tools, WebView2 Runtime, `cargo`, `cross-env` |

---

## Common Pitfalls

1. **"My local build hit prod."** Before the explicit `cross-env` fix, local scripts relied on Vite's `.env.production` loading. If a machine's `.env.production` contained the prod URL, local builds silently shipped with the prod URL. Fixed: every script now passes `VITE_API_URL` explicitly.
2. **"Failed to fetch" in an installed desktop app.** Check: (a) is the installer actually the `-0` local variant or the prod one? (b) is `ns-api` running on `localhost:3004`? (c) does `ns-api`'s `CORS_ORIGIN` include `http://tauri.localhost` (Windows) / `tauri://localhost` (macOS)?
3. **MSI bundler rejects version.** Caused by a non-numeric pre-release tag (e.g. `-dev`, `-beta`). Keep pre-release suffixes numeric (`-0`, `-1`).
4. **`'VITE_API_URL' is not recognized` on Windows.** A build script forgot `cross-env`. Always use `cross-env` when prefixing env vars in npm scripts.
5. **Windows build fails with `E0599: no variant named 'Opened'`.** A macOS-only Tauri API (e.g. `RunEvent::Opened` file-association events) is referenced without a `#[cfg(target_os = "macos")]` gate. Gate platform-specific APIs.
6. **Local and prod bundle files sharing `target/release/`.** They do, intentionally. Bundle filenames include the version so MSIs/NSIS files don't collide, but the top-level `NoteSync.exe` is overwritten on each build.

---

## Before You Build (checklist)

### macOS

1. `npm install` at repo root (once)
2. Ensure a git tag exists (`git describe --tags --abbrev=0` must succeed)
3. For prod: run `tauri:clear-cache` implicitly via the script — don't skip it
4. Run the desired script from `packages/ns-desktop/`

### Windows

1. Ensure Rust (`cargo`), MSVC Build Tools, WebView2 Runtime are installed
2. `npm install` at repo root (once)
3. Ensure a git tag exists
4. For local builds, ensure `ns-api` is actually running and `CORS_ORIGIN` includes `http://tauri.localhost`
5. Run the desired script from `packages/ns-desktop/`

---

## Related Docs

- `docs/ns/desktop/docs/features/16-build-and-distribution.md` — historical feature doc (original implementation notes; superseded by this file for current state)
- `docs/ns/desktop/docs/features/27-windows-meeting-audio-capture.md` — Windows-specific Rust gating example
- Project memory `windows_dev_setup.md` — broader Windows dev environment notes (Docker pgvector, Prisma workaround, CORS origins)
