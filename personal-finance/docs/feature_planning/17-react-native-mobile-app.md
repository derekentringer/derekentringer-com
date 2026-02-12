# 17 — React Native Mobile App

**Status:** Not Started
**Phase:** 6 — Mobile & PWA
**Priority:** Low

## Summary

Android-focused React Native companion app that shares the backend API and TypeScript types with the web frontend. Provides a native mobile experience for checking finances on the go.

## Requirements

- Core mobile screens:
  - Dashboard (net worth, account summary)
  - Account list and detail views
  - Transaction list with search/filter
  - Budget overview (spending vs. budget by category)
  - Bill reminders and upcoming due dates
- Shared code with web (`packages/shared/`):
  - TypeScript types and interfaces
  - Validation schemas
  - Financial calculation utilities
  - API client / data fetching logic
- Mobile-specific features:
  - Push notifications for bill reminders and budget alerts
  - Biometric authentication (fingerprint/face) as alternative to PIN
  - Quick-glance widgets (net worth, budget remaining)
- Platform: Android-first, but React Native supports iOS cross-compilation
- Auth: same JWT-based auth as web, with secure token storage (React Native Keychain)

## Technical Considerations

- React Native project scaffolded in `packages/mobile/`
- Navigation: React Navigation (standard for React Native)
- Charts: Victory Native (shares API with Victory web charts — potential for shared chart components)
- State management: same approach as web (React Query / TanStack Query for API caching)
- Secure storage: `react-native-keychain` for JWT tokens, `react-native-encrypted-storage` for sensitive cached data
- Build/deploy: EAS Build (Expo Application Services) or standard React Native CLI
- Consider Expo for faster development if native module requirements allow

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — monorepo setup with mobile package
- [01 — Auth & Security](01-auth-and-security.md) — API auth for mobile client
- All Phase 1-3 features — mobile app consumes the same API, so backend features must be built first

## Open Questions

- Expo vs. bare React Native CLI?
- Google Play Store distribution or sideload APK only (personal use)?
- Which features are mobile-critical vs. web-only?
- Should mobile support CSV import (file picker on Android) or is that web-only?
