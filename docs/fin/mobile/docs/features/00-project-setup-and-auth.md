# 00 — Project Setup & Auth

**Status:** Complete
**Phase:** 0 — Project Setup & Auth
**Priority:** High
**Completed:** v1.18.0

## Summary

Bootstrapped the Expo React Native project in `packages/mobile/`, integrated with the monorepo, established the dark theme and navigation shell, and implemented complete auth flow with body-based refresh tokens. Modified the finance-api and shared types to support mobile authentication.

## What Was Implemented

- Expo ~54 project with new architecture enabled, monorepo-aware Metro config, and TypeScript strict mode
- Dark theme color palette matching finance-web CSS variables (`#0f1117` background, `#2563eb` primary, etc.)
- Zustand auth store with expo-secure-store persistence, proactive token refresh (30s buffer), and shared refresh lock
- Axios API client with `X-Client-Type: mobile` header, request interceptor (Bearer auth), response interceptor (401 retry)
- React Navigation bottom tab navigator (5 tabs: Dashboard, Accounts, Activity, Planning, More) with auth-conditional routing
- Login screen with FinLogo SVG, username/password form, error handling, and loading states
- Placeholder stub screens for all five bottom tabs
- React Query v5 configured (5-min staleTime, 30-min gcTime, 2 retries)
- EAS Build profiles (development/preview/production) configured for APK sideload distribution
- Jest test infrastructure with mocks for react-native, expo-secure-store, react-native-reanimated, react-native-svg, and @expo/vector-icons
- **API changes:** Added `isMobileClient()` helper to finance-api auth routes; mobile clients receive refresh tokens in response body instead of HttpOnly cookies; `/auth/refresh` and `/auth/logout` accept body-based refresh tokens
- **Shared type changes:** Added optional `refreshToken?: string` to `LoginResponse` and `RefreshResponse`
- **CORS update:** Finance-api allows requests with no origin header (mobile apps, non-browser clients)
- **Vite config update:** Added `host: true` to web and finance-web Vite configs for all-interface binding
- **React version alignment:** Synchronized `react` and `react-dom` to 19.2.4 across workspace

## Resolved Open Questions

- **App naming:** Used "Fin" (not "FinDash") with bundle ID `com.derekentringer.fin` for consistency with the web app branding
- **Physical device development:** Android requires `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3002 tcp:3002` to tunnel Metro and API ports from device to dev machine
- **Typography system:** Deferred — using default system fonts; Roboto integration planned for Phase 7 (Polish)
- **PIN verification UI:** API integration implemented in auth store; screen UI deferred to Phase 2 (Accounts & Transactions) where PIN-gated operations are needed
- **Notification system:** Deferred to Phase 6 (Reports, Settings & Notifications); expo-notifications not yet added as dependency
