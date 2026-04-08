# 32 — App Store & Play Store Publishing

**Status:** Planned
**Phase:** Phase 1 — Launch Readiness
**Priority:** High
**Depends on:** Feature plan 30 (Branding & Domain Migration)

## Summary

Publish the mobile app to Apple App Store and Google Play Store, and optionally the desktop app to Mac App Store. Sideload-only distribution kills adoption — most users discover apps through stores.

## Platforms

### iOS (App Store)

- **Requirements:** Apple Developer Program ($99/year), Xcode, code signing
- **Current state:** React Native + Expo app exists in `packages/ns-mobile/`
- **Steps:**
  1. Enroll in Apple Developer Program
  2. Create App Store Connect listing (name, description, screenshots, keywords)
  3. Generate app icons (all required sizes)
  4. Create screenshots for required device sizes (6.7", 6.5", 5.5", iPad)
  5. Configure push notifications certificate (if enabling iOS push — currently Android-only)
  6. Build with `eas build --platform ios`
  7. Submit for App Review
  8. Privacy nutrition labels (data collection disclosure)

- **Review risks:** Apple may push back on "duplicate functionality" (note taking). Strong differentiation (AI features) helps.

### Android (Play Store)

- **Requirements:** Google Play Developer account ($25 one-time)
- **Current state:** React Native + Expo app exists, APK sideload works
- **Steps:**
  1. Create Google Play Console listing
  2. Generate signed AAB (Android App Bundle)
  3. Create screenshots for phone and tablet
  4. Create feature graphic (1024x500)
  5. Write store listing (title, short description, full description)
  6. Set content rating questionnaire
  7. Build with `eas build --platform android`
  8. Submit for review (usually 1-3 days)

### macOS (Mac App Store) — Optional

- **Current state:** Tauri desktop app with ad-hoc signing
- **Requirements:** Apple Developer Program (same as iOS), Mac App Store provisioning profile
- **Considerations:** Mac App Store requires sandboxing which may conflict with Tauri file access, local SQLite, and audio recording. Direct download (.dmg from website) may be simpler.
- **Recommendation:** Start with direct download from website, consider Mac App Store later if demand warrants the sandboxing work.

## Store Listing Content

### Keywords/Tags
- note taking, markdown, AI, wiki links, productivity, writing, journal, knowledge base

### Description Template
```
[Product Name] is an AI-powered note-taking app that works everywhere.

- Write in markdown with a live preview editor
- AI completions, transcription, and Q&A built in
- Wiki-links to connect your notes
- Sync across web, desktop, and mobile
- Command palette for keyboard-first workflow
- Dark and light themes

Works on the web, macOS, iOS, and Android.
```

## Verification

- App installs and launches from store on fresh device
- Sign up / sign in flow works
- Sync connects and transfers notes
- AI features work (if on Pro tier)
- Push notifications work (Android)
- No crash reports in first 48 hours
