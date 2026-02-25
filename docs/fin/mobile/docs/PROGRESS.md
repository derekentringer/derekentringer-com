# Personal Finance Mobile App — Progress Tracker

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Expo ~54 | Managed workflow, new architecture enabled |
| Language | TypeScript ~5.9 | Shared types with API and web |
| Navigation | React Navigation 7 | Native stack + bottom tabs + material top tabs |
| Server state | TanStack React Query v5 | Consistent with web app |
| Local state | Zustand v5 | Lightweight store for auth and preferences |
| HTTP | Axios | Auth interceptor with body-based refresh tokens |
| Token storage | expo-secure-store | Secure credential storage |
| Charts | react-native-chart-kit + react-native-svg | Native chart rendering |
| Push | expo-notifications + FCM | Android only (iOS excluded — requires paid Apple Developer account) |
| Fonts | @expo-google-fonts/roboto | Matches web app |
| Testing | Jest + jest-expo + @testing-library/react-native | Unit and component tests |
| Build | EAS Build | APK for Android sideload, ad-hoc IPA for iOS |

## Architecture Decisions

- **Expo managed workflow** — faster setup, EAS Build, built-in FCM, OTA updates possible later
- **Monorepo integration** — `packages/mobile/` shares `packages/shared/` types and utilities with API and web
- **No CSV/PDF import** — file import is a desktop workflow; excluded from mobile
- **Sideload-only** — APK for Android, ad-hoc IPA for iOS; no app store listings
- **Push notifications Android-only** — iOS requires paid Apple Developer account for APNs
- **Bottom tabs (5)** — Dashboard, Accounts, Activity, Planning, More; keeps primary actions within thumb reach
- **Decision tools computed client-side** — pure functions matching web's `decisionCalculators.ts`, no API endpoints
- **Dark mode only** — matches web app's dark theme
- **Mobile auth via request body** — `X-Client-Type: mobile` header triggers body-based refresh token delivery (React Native can't read HttpOnly cookies)

## Phases

### Phase 0: Project Setup & Auth

- [x] [00 — Project Setup & Auth](features/00-project-setup-and-auth.md)

### Phase 1: Dashboard

- [ ] [01 — Dashboard](feature_planning/01-dashboard.md)

### Phase 2: Accounts & Transactions

- [ ] [02 — Accounts & Transactions](feature_planning/02-accounts-and-transactions.md)

### Phase 3: Bills & Budgets

- [ ] [03 — Bills & Budgets](feature_planning/03-bills-and-budgets.md)

### Phase 4: Goals & Projections

- [ ] [04 — Goals & Projections](feature_planning/04-goals-and-projections.md)

### Phase 5: Portfolio & Decision Tools

- [ ] [05 — Portfolio & Decision Tools](feature_planning/05-portfolio-and-decision-tools.md)

### Phase 6: Reports, Settings & Notifications

- [ ] [06 — Reports, Settings & Notifications](feature_planning/06-reports-settings-and-notifications.md)

### Phase 7: Polish & Distribution

- [ ] [07 — Polish & Distribution](feature_planning/07-polish-and-distribution.md)

## Status Key

- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Complete

## Workflow

1. Feature docs live in `feature_planning/` while in backlog or in-progress
2. When a phase is fully implemented, move its doc to `features/`
3. Update the checkbox and link path in this file
