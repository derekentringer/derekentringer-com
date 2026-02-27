# 06 — Polish & Distribution

**Status:** Not Started
**Phase:** 4 — Polish
**Priority:** Low

## Summary

Final polish, app icon, splash screen, push notifications (Android only), and EAS Build for APK and IPA distribution.

## Requirements

- **App icon & splash screen**:
  - Custom NoteSync app icon
  - Splash screen with NoteSync branding
  - Configured via `app.json` / `app.config.ts`
- **Push notifications** (Android only):
  - Firebase Cloud Messaging (FCM) via `expo-notifications`
  - Register device token with notesync-api
  - Notification types:
    - Sync complete (when a large sync finishes in the background)
    - AI task complete (when a long-running AI operation finishes)
  - Notification preferences in settings
  - API endpoints:

    | Method | Path | Auth | Description |
    |--------|------|------|-------------|
    | POST | `/devices` | Yes | Register device token |
    | DELETE | `/devices/:token` | Yes | Unregister device token |

- **Settings screen**:
  - Theme (dark mode only initially; future: light/system)
  - Editor preferences (font size, toolbar customization)
  - AI toggles (per-feature, daily limit)
  - Sync settings (interval, manual sync, last synced)
  - Push notification preferences
  - Account (logout)
  - About (version, links)
- **Haptic feedback**:
  - On note delete, sync complete, AI result received
  - Configurable on/off in settings
- **EAS Build & distribution**:
  - Configure `eas.json` for build profiles:
    - `development`: local dev build
    - `preview`: internal testing APK/IPA
    - `production`: release APK/IPA
  - Android: build APK for sideloading
  - iOS: build ad-hoc IPA (no Apple Developer account needed for personal device via Expo dev client, or use ad-hoc provisioning)
  - GitHub Actions workflow for automated builds (optional)
- **Performance**:
  - Optimize FlatList rendering for large note collections
  - Lazy load note content (only fetch full markdown when opening a note)
  - Minimize re-renders with `useMemo`, `useCallback`, `React.memo`
- **Error handling**:
  - Global error boundary with friendly error screen
  - Network error toasts (non-blocking)
  - Retry logic for failed API calls

## Technical Considerations

- Push notifications: only Android via FCM; iOS push requires a paid Apple Developer account ($99/year) — skip for now
- EAS Build handles native compilation in the cloud; no local Xcode/Android Studio required for building
- APK sideloading on Android: enable "Install from unknown sources" in device settings
- iOS ad-hoc: requires adding device UDID to provisioning profile; limited to 100 devices
- App icon: use Expo's `expo-image` or a design tool; configure in `app.json` under `icon` and `adaptiveIcon`
- Splash screen: `expo-splash-screen` with `SplashScreen.preventAutoHideAsync()` until auth state is resolved

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs app shell
- [04 — Sync Engine](04-sync-engine.md) — push notifications depend on sync infrastructure
- [05 — AI Features](05-ai-features.md) — AI settings and notification types depend on AI features

## Open Questions

- Should iOS builds be included in the initial release, or deferred until an Apple Developer account is purchased?
- App icon design: simple text-based logo, or a custom graphic?
- Should push notifications include note content previews, or just a generic "sync complete" message?
