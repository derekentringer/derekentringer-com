# 16 — Build & Distribution

**Status:** Complete
**Phase:** 11 — Build & Distribution
**Priority:** Low

> **Note:** This file documents the original build-system feature work. For the **current** authoritative build reference (scripts, env var precedence, cross-platform output locations, common pitfalls), see [`docs/ns/desktop/docs/BUILD.md`](../BUILD.md). If the two disagree, `BUILD.md` is correct.

## Summary

Environment-aware build scripts for the NoteSync desktop Tauri app. Supports switching between local development (`localhost:3004`) and production (`ns-api.derekentringer.com`) API targets via `.env` files and npm scripts, with automatic version sync from git tags.

---

## What Was Implemented

### 1. Environment Files

**`.env`** (gitignored, local dev default):
- `VITE_API_URL=http://localhost:3004`

**`.env.production`** (gitignored, loaded via `--mode production`):
- `VITE_API_URL=https://ns-api.derekentringer.com`

**`.env.example`** (checked into git):
- Documents required env vars for new developers

The root `.gitignore` already handles `.env` and `.env.*` with `!.env.example`, so `.env` and `.env.production` are gitignored while `.env.example` is tracked.

### 2. Build Scripts

**File:** `packages/ns-desktop/package.json`

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tauri dev` | Local development with hot reload — always use this for local testing (no packaged local build exists) |
| `tauri:build:prod` (macOS) | `npm run tauri:version-sync && APPLE_SIGNING_IDENTITY=- VITE_API_URL=... tauri build --target universal-apple-darwin` | Syncs version from git tag, ad-hoc code signs for TCC permission persistence, inline env var override bakes in prod URL, builds universal binary (ARM + Intel) |
| `tauri:build:prod:win` (Windows) | `npm run tauri:version-sync && cross-env VITE_API_URL=... tauri build` | Windows equivalent. Uses `cross-env` because `cmd.exe` does not understand bash-style inline env prefixes. Unsigned (no Windows code-signing cert available). |
| `vite:build:prod` | `vite build --mode production` | Vite-only build loading `.env.production` |
| `tauri:version-sync` | `node -e "..."` | Reads latest git tag, writes version to `tauri.conf.json` |

The inline `VITE_API_URL=` approach for `tauri:build:prod` is needed because `tauri build` invokes `beforeBuildCommand` (`npm run vite:build`) internally and there's no way to pass `--mode production` through to Vite.

### 3. Version Sync

The `tauri:version-sync` script:
1. Runs `git describe --tags --abbrev=0` to get the latest tag (e.g., `v1.77.0`)
2. Strips the `v` prefix → `1.77.0`
3. Reads `src-tauri/tauri.conf.json`
4. Updates the `version` field
5. Writes back with `JSON.stringify(c, null, 2)` formatting

The version is baked into:
- DMG filename (e.g., `NoteSync_1.77.0_universal.dmg`)
- macOS "About" dialog
- App metadata / `Info.plist`

### 4. High-Fidelity App Icons

The `.icns` file includes all 10 required Apple iconset sizes from 16x16 up to 1024x1024 pixels, generated from the SVG vector source (`packages/ns-web/public/logo.svg`) via ImageMagick + Apple `iconutil`. The 1024x1024 variant (`ic10`) is critical for sharp display in the macOS app switcher, About window, and Applications folder on Retina displays. Icons are regenerated from SVG whenever the logo changes:

```bash
magick -background none -density 400 logo.svg -resize 1024x1024 master_1024.png
# Generate all 10 sizes into icon.iconset/
iconutil -c icns icon.iconset -o icon.icns
```

### 5. Ad-Hoc Code Signing

The `tauri:build:prod` script sets `APPLE_SIGNING_IDENTITY=-` to enable ad-hoc code signing. This gives the app a stable `CDHash` identity that macOS TCC uses to persist permission grants (microphone, system audio recording). Without signing, TCC has no stable identity and may re-prompt on every use. Ad-hoc signing requires no Apple Developer account. The signing step appears in the build output as `Signing with identity "-"`.

### 6. No Source Code Changes Needed

The three files using `import.meta.env.VITE_API_URL || "http://localhost:3004"` already work correctly — when `VITE_API_URL` is set via env file or inline, the fallback is never reached.

## Usage

| Command | API Target | Notes |
|---------|-----------|-------|
| `npm run dev` | localhost:3004 | Tauri dev mode with hot reload — use for all local development on both macOS and Windows |
| `npm run tauri:build:prod` | ns-api.derekentringer.com | Universal macOS binary, version synced, ad-hoc signed |
| `npm run tauri:build:prod:win` | ns-api.derekentringer.com | Windows x64 MSI + NSIS, version synced, unsigned |
| `npm run vite:build:prod` | ns-api.derekentringer.com | Vite-only (no Tauri) |

## Files Changed

### New Files

| File | Description |
|------|-------------|
| `packages/ns-desktop/.env` | Local dev env (gitignored) |
| `packages/ns-desktop/.env.production` | Production env (gitignored) |
| `packages/ns-desktop/.env.example` | Env template (tracked) |

### Modified Files

| File | Changes |
|------|---------|
| `packages/ns-desktop/package.json` | Added `tauri:build:prod` (macOS), `tauri:build:prod:win` (Windows), `vite:build:prod`, `tauri:version-sync` scripts |
