# 16 — Build & Distribution

**Status:** Complete
**Phase:** 11 — Build & Distribution
**Priority:** Low

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
| `tauri:build:local` | `tauri build` | Alias for `tauri build`, loads `.env` (localhost) |
| `tauri:build:prod` | `npm run tauri:version-sync && VITE_API_URL=... tauri build --target universal-apple-darwin` | Syncs version from git tag, inline env var override bakes in prod URL, builds universal binary (ARM + Intel) |
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

### 5. No Source Code Changes Needed

The three files using `import.meta.env.VITE_API_URL || "http://localhost:3004"` already work correctly — when `VITE_API_URL` is set via env file or inline, the fallback is never reached.

## Usage

| Command | API Target | Notes |
|---------|-----------|-------|
| `npm run dev` | localhost:3004 | Tauri dev mode |
| `npm run tauri:build` | localhost:3004 | Default build |
| `npm run tauri:build:local` | localhost:3004 | Explicit local alias |
| `npm run tauri:build:prod` | ns-api.derekentringer.com | Universal binary, version synced |
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
| `packages/ns-desktop/package.json` | Added `tauri:build:local`, `tauri:build:prod`, `vite:build:prod`, `tauri:version-sync` scripts |
