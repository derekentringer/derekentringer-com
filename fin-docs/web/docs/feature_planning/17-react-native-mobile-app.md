# 17 — React Native Mobile App

**Status:** Not Started
**Phase:** 7 — Mobile & PWA
**Priority:** Low

## Summary

A React Native (Expo) companion app for the personal finance dashboard, providing native mobile access to all major features. Android-focused with iOS also built. Push notifications on Android only (via FCM); iOS will not have push. Distribution is sideload-only (APK for Android, direct install for iOS). CSV/PDF file import is excluded — everything else from the web app is included.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Expo ~54 (managed workflow, new architecture enabled) |
| Language | TypeScript ~5.9 |
| Navigation | React Navigation 7 (native stack + bottom tabs + material top tabs) |
| Server state | TanStack React Query v5 |
| Local state | Zustand v5 |
| HTTP | Axios with auth interceptor |
| Token storage | expo-secure-store |
| Charts | react-native-chart-kit + react-native-svg |
| Push | expo-notifications + FCM (Android only) |
| Fonts | @expo-google-fonts/roboto (matches web) |
| Testing | Jest + jest-expo + @testing-library/react-native |
| Build | EAS Build (APK for sideload) |

## Pre-requisite: API Changes for Mobile Auth

The finance-api delivers refresh tokens exclusively via HttpOnly cookies. React Native cannot read HttpOnly cookies. Before the mobile app can authenticate:

**Modify `packages/shared/src/types/auth.ts`:**
- Add optional `refreshToken?: string` to `LoginResponse`

**Modify `packages/finance-api/src/routes/auth.ts`:**
- On `/auth/login`: when `X-Client-Type: mobile` header is present, also include `refreshToken` in the JSON response body (alongside the existing cookie)
- On `/auth/refresh`: when `X-Client-Type: mobile` header is present, accept `refreshToken` from request body (`request.body.refreshToken`) in addition to `request.cookies?.refreshToken`

No CORS changes needed — React Native makes native HTTP requests that bypass CORS entirely.

## Navigation Architecture

**Bottom Tabs (5):**
1. **Dashboard** — KPIs, charts, upcoming bills, goals summary, AI insights
2. **Accounts** — Account groups → account list → account detail + balance history
3. **Activity** — Top tabs: Transactions, Bills, Budgets
4. **Planning** — Top tabs: Goals, Projections, Decision Tools
5. **More** — Reports, Portfolio, Settings, Notifications

Root Stack wraps tabs and provides modal screens for all create/edit forms and PIN verification.

## Implementation Phases

Detailed planning docs for each phase live in the mobile docs directory:
- [Phase 0 — Project Setup & Auth](../../../mobile/docs/feature_planning/00-project-setup-and-auth.md)
- [Phase 1 — Dashboard](../../../mobile/docs/feature_planning/01-dashboard.md)
- [Phase 2 — Accounts & Transactions](../../../mobile/docs/feature_planning/02-accounts-and-transactions.md)
- [Phase 3 — Bills & Budgets](../../../mobile/docs/feature_planning/03-bills-and-budgets.md)
- [Phase 4 — Goals & Projections](../../../mobile/docs/feature_planning/04-goals-and-projections.md)
- [Phase 5 — Portfolio & Decision Tools](../../../mobile/docs/feature_planning/05-portfolio-and-decision-tools.md)
- [Phase 6 — Reports, Settings & Notifications](../../../mobile/docs/feature_planning/06-reports-settings-and-notifications.md)
- [Phase 7 — Polish & Distribution](../../../mobile/docs/feature_planning/07-polish-and-distribution.md)

## Key Decisions

- **Expo managed workflow** — faster setup, EAS Build, built-in FCM, OTA updates possible later
- **No CSV/PDF import** — file import is a desktop workflow; excluded from mobile
- **Sideload-only** — APK for Android, ad-hoc IPA for iOS; no app store listings
- **Push notifications Android-only** — iOS requires paid Apple Developer account for APNs
- **Bottom tabs (5)** — Dashboard, Accounts, Activity, Planning, More; keeps primary actions within thumb reach
- **Decision tools computed client-side** — pure functions matching web's `decisionCalculators.ts`, no API endpoints
- **Dark mode only** — matches web app's dark theme
- **Mobile auth via request body** — `X-Client-Type: mobile` header triggers body-based refresh token delivery

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — monorepo setup with mobile package
- [01 — Auth & Security](01-auth-and-security.md) — API auth for mobile client
- All web features through Phase 6 — mobile app consumes the same API
