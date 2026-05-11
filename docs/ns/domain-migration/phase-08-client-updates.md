# Phase 8 — Client App Updates

**Status**: 🟡 Not started
**Depends on**: Phase 6 (api production-ready), Phase 7 (DNS staged)
**Blocks**: Phase 9 (cutover — clients need to be ready before users hit the new domain)
**Goal**: produce signed (or sideload-signed) builds of the desktop and mobile apps that point at `api.notate.md`, with new bundle identifiers, ready to distribute to test users immediately after cutover.

This is the most user-visible breaking-change phase. Bundle ID changes mean every existing install on every device becomes an "old app" that won't update — users have to install fresh.

## Bundle ID change consequences

| Platform | What breaks | Mitigation |
|----------|-------------|------------|
| iOS sideload | Old IPA stays installed but never updates; new IPA installs alongside | Email testers; old app keeps working until they delete it |
| Android sideload | Same — different package id is a different app | Same |
| Android Play Store (future) | A new listing entirely; no review history transfers | Defer Play Store launch until post-migration |
| iOS TestFlight (future) | New TestFlight build entirely | Same |
| macOS Tauri | New `.app` bundle id; users with the old app must reinstall | Email; the data is server-side so nothing on disk is lost beyond local SQLite cache |
| Windows MSI / NSIS | Same — different "product code" means side-by-side install | Email |
| WebAuthn passkeys | Tied to RP_ID (domain), not bundle ID — but they'll re-register either way per Phase 9 | Per Phase 0 D.6 |

## Tasks

### A. Desktop builds (`packages/desktop`)

- [ ] Confirm `tauri.conf.json` has the new bundle id `md.notate.app` (per Phase 0 D.8) and `tauri.dev.conf.json` has `md.notate.app.dev` (per D.9)
- [ ] Update `npm run tauri:build:prod` to bake `VITE_API_URL=https://api.notate.md`
- [ ] Update `npm run tauri:build:prod:win` to same
- [ ] Tag the first Notate release: `v3.0.0` (or whatever bump represents "major rebrand")
- [ ] Build:
  - [ ] macOS: `npm run tauri:build:prod` → universal `.dmg`
  - [ ] Windows: `npm run tauri:build:prod:win` → MSI + NSIS installer
- [ ] Local install + smoke-test against `api.notate.md` (using DNS overrides via `/etc/hosts` if cutover hasn't happened yet)
- [ ] Generate release notes (per `packages/desktop/scripts/generate-release-notes.mjs`) — add a "First release on `notate.md`" preamble

### B. Mobile builds (`packages/mobile`)

- [ ] Confirm `app.config.ts` derives `expo.ios.bundleIdentifier` / `expo.android.package` from `APP_VARIANT`: prod → `md.notate.app`, dev → `md.notate.app.dev` (per Phase 0 D.8 / D.9)
- [ ] **Run `npx expo prebuild --platform android --clean`** to regenerate the Android manifest with the new package id
- [ ] **Run `npx expo prebuild --platform ios --clean`** to regenerate the iOS Xcode project with the new bundle id
- [ ] Update `devHost.ts`'s `PROD_API_URL` to `https://api.notate.md`
- [ ] Build APK: `npx expo run:android --variant release` (or `eas build --platform android --profile production` if EAS is in play)
- [ ] Build IPA (ad-hoc): `npx expo run:ios --device --configuration Release` (or `eas build --platform ios --profile production`)
- [ ] Sideload to test devices, smoke-test sign-in + sync + audio + share-sheet against the new API
- [ ] **Critical**: native rebuild required because of bundle id change — confirm the prebuild ran cleanly and `android/` + `ios/` directories regenerated

### C. Distribution mechanics

- [ ] Pick a distribution channel for the new builds:
  - **GitHub Releases** on the new `notate` repo: each platform's binary attached, public download links
  - **Direct hosting**: drop binaries on `notate.md/download` (matches existing `ns.derekentringer.com/download` if there is one)
- [ ] Generate SHA-256 checksums for all binaries; publish alongside

### D. Testing matrix

For each platform, sign in as a test user (carried over from the migrated DB), then:

- [ ] Notes list loads
- [ ] Create + edit + delete notes syncs across platforms
- [ ] Image upload + display
- [ ] Audio recording + transcription job lifecycle
- [ ] Share-sheet integration (mobile)
- [ ] Settings persist across launches
- [ ] WebAuthn passkey re-registration flow works (mobile / desktop / web)
- [ ] Folder picker, append-to-note, URL paste-to-preview all functional

### E. Communicate with existing testers

Per the bundle ID consequences table, existing test users need to download fresh:

- [ ] Email list of current testers
- [ ] Subject: "NoteSync is becoming Notate — please install the new app"
- [ ] Body: explain the rebrand, link to download page, note that the OLD app still works for read-only on `ns.derekentringer.com` until [date] (Phase 10's old-stack sunset), but they should switch ASAP
- [ ] Send 2–3 days before Phase 9 cutover

## Verification gates

- [ ] Desktop builds smoke-tested on macOS + Windows
- [ ] Mobile builds sideloaded + smoke-tested on Android + iOS
- [ ] Distribution links resolve and binaries download
- [ ] Tester email drafted, recipient list confirmed
- [ ] Each build talks to `api.notate.md` (verified via network capture or Railway logs)

## Done criteria

- [ ] All A–E tasks complete
- [ ] Verification gates green
- [ ] Phase 9 cutover can proceed knowing the apps are ready

## Roll-back

If Phase 9 cutover gets aborted, the new app builds are harmless — they just point at an `api.notate.md` that's not yet serving real users. Keep them in cold storage until cutover succeeds.
