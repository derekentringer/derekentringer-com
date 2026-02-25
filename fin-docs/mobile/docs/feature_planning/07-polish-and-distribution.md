# Phase 7 — Polish & Distribution

**Status:** Not Started
**Priority:** Low

## Summary

App icons, splash screen, error handling, UX polish, and EAS build configuration for sideload distribution.

## Tasks

- Generate icon assets from FinLogo source (`designs/fin-app/fin_logo/`)
- Configure splash screen (`#0f1117` background)
- Add skeleton loading components for all data screens
- Error boundary with retry
- Offline detection banner via @react-native-community/netinfo
- Haptic feedback on interactive actions (expo-haptics)
- Keyboard-aware scroll views for forms
- EAS build: `eas build --platform android --profile production` → APK
- EAS build: `eas build --platform ios --profile production` → IPA (ad-hoc)
- `README.md` with setup, dev, and build instructions

## Verification

- `eas build --platform android --profile production` produces APK
- Splash screen displays correctly with dark background
- Skeleton loading screens render during data fetches
- Error boundary catches and displays errors with retry option
- Offline banner appears when network is unavailable
- Haptic feedback fires on button presses and swipe actions

## Dependencies

- [Phase 6 — Reports, Settings & Notifications](06-reports-settings-and-notifications.md)
