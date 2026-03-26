# 00 — Project Setup & Auth

**Status:** Complete
**Phase:** 0 — Project Setup & Auth
**Priority:** High
**Completed:** v1.93.26

## Summary

Bootstrapped the Expo React Native project in `packages/ns-mobile/`, integrated with the monorepo, established dark+light theme with NoteSync lime-yellow palette, navigation shell, complete auth flow with TOTP 2FA support, local SQLite database, and full test coverage. Copied patterns from the existing fin-mobile app, adapted for NoteSync (different API, branding, theme, SQLite database).

## What Was Implemented

### Project Scaffolding

- Expo ~54 project with new architecture enabled, monorepo-aware Metro config (watches `packages/shared` + `packages/ns-shared`), and TypeScript strict mode
- `@derekentringer/ns-shared` workspace dependency for NoteSync-specific types (Note, FolderInfo, SyncChange, etc.)
- EAS Build profiles (development/preview/production) configured for APK sideload distribution
- Babel config with `@` path alias and react-native-reanimated plugin
- NoteSync app branding: name "NoteSync", slug "notesync", bundle ID `com.derekentringer.notesync`, `userInterfaceStyle: "automatic"` (dark+light)
- NoteSync icon assets: icon.png, adaptive-icon.png, splash-icon.png — lime-yellow rounded square with black plus sign, generated from ns-web logo.svg

### Theme

- Dark and light color palettes with NoteSync lime-yellow primary (`#d4e157`)
- `useThemeColors()` hook using `useColorScheme()` for automatic dark/light switching
- Spacing and border radius tokens matching fin-mobile conventions
- `darkColors` export as default `colors` for static contexts (loading screens, error boundary)

### Authentication & API

- Zustand auth store with `initialize()`, `login()`, `verifyTotp()`, `logout()`, `setUser()`
- `initialize()`: restores session from SecureStore, refreshes expired tokens, fetches user from API
- Auth failure callback clears Zustand state on token revocation
- Mobile token adapter with `ns_` storage key prefix (`ns_access_token`, `ns_refresh_token`)
- Shared `createTokenManager` from `@derekentringer/shared/token` with mobile adapter
- Axios API client with `X-Client-Type: mobile` header, Bearer auth interceptor, 401 retry via TokenManager refresh
- Base URL: `http://localhost:3004` (dev) / `https://ns-api.derekentringer.com` (prod)
- Auth API: login, TOTP verify, logout, getMe, setupTotp, verifyTotpSetup, disableTotp, changePassword, forgotPassword, resetPassword

### SQLite Database

- `expo-sqlite` with `initDatabase()` creating 5 tables:
  - `notes` — full note data with sync_status, folder references, tags (JSON), favorites, sort order
  - `folders` — hierarchical folder structure with parent_id, sort order, favorites
  - `note_versions` — version history with origin tracking
  - `sync_queue` — offline change queue with entity type and action
  - `sync_meta` — key-value store for sync cursors and metadata

### Navigation

- Auth-conditional routing: AuthStack (Login) vs MainTabNavigator
- Bottom tabs: Dashboard, Notes, Search, AI, Settings
- Tab icons via MaterialCommunityIcons
- Theme-aware tab bar and header colors via `useThemeColors()`

### Screens

- **LoginScreen** — Email/password form with NoteSync branding (NsLogo + "NoteSync" title); TOTP 2FA step with 6-digit auto-submit code input and backup code fallback; haptic feedback on success/error; theme-aware styling; dark button text on lime-yellow primary
- **SettingsScreen** — User email display, logout button with confirmation alert; theme-aware card styling
- **DashboardScreen, NotesScreen, SearchScreen, AiScreen** — Placeholder screens with theme-aware styling

### Components

- **NsLogo** — React Native SVG component rendering the NoteSync logo (lime-yellow rounded square with black plus), matching ns-web's NsLogo SVG
- **ErrorBoundary** — Class component with retry button, matching fin-mobile pattern

### Root App

- `src/App.tsx`: GestureHandlerRootView → QueryClientProvider → SafeAreaProvider → BottomSheetModalProvider → StatusBar (auto) → ErrorBoundary → AppNavigator
- React Query configured with 5-min staleTime, 30-min gcTime, 2 retries

### Tests (27 tests, 4 suites — all passing)

- **api.test.ts** (6 tests) — tokenStorage read/write/clear, tokenManager interface validation
- **mobileTokenAdapter.test.ts** (8 tests) — doRefresh (no token, success, 401/403 auth failure, 500 transient error), onRefreshSuccess (with/without refresh token), onAuthFailure
- **authStore.test.ts** (8 tests) — initialize (no token, auth failure callback, expired token refresh), login (TOTP required, successful), verifyTotp, logout (success, API failure resilience)
- **database.test.ts** (5 tests) — database open, all 5 tables created, notes/folders/sync_queue column validation

### Mocks

- `react-native.js` — Platform, StyleSheet, View, Text, TextInput, etc. + `useColorScheme` returning "dark"
- `@expo/vector-icons.js` — MaterialCommunityIcons, Ionicons, FontAwesome stubs
- `react-native-svg.js` — Svg, Path, Circle, Rect, G, Line, Text stubs
- Jest setup: expo-secure-store, expo-sqlite, @react-navigation, react-native-reanimated mocks

## Verification

1. `npm install` from workspace root — clean
2. `npx tsc --noEmit` in `packages/ns-mobile/` — clean
3. `npx turbo run type-check --filter=@derekentringer/ns-mobile` — clean (builds shared + ns-shared deps)
4. `npm test` in `packages/ns-mobile/` — 27/27 passing across 4 suites

## Key Patterns Reused from fin-mobile

| Pattern | Source | Adaptation |
|---------|--------|------------|
| Token management | `packages/shared/src/token/createTokenManager.ts` | Same shared module |
| Mobile token adapter | `packages/fin-mobile/src/services/mobileTokenAdapter.ts` | `ns_` prefix for storage keys |
| Auth types | `packages/shared/src/types/auth.ts` | Same shared types |
| NoteSync types | `packages/ns-shared/src/types.ts` | New dependency |
| Axios interceptors | `packages/fin-mobile/src/services/api.ts` | API URL → `:3004`, removed register/revokeAllSessions |
| Zustand auth store | `packages/fin-mobile/src/store/authStore.ts` | Same pattern |
| Metro monorepo config | `packages/fin-mobile/metro.config.js` | Added ns-shared watch folder |
| Jest config + mocks | `packages/fin-mobile/jest.config.js` | Added expo-sqlite mock |

## What's Next

- Feature 01: Note List & Viewer — fetch notes from API, display in FlatList, markdown preview
- Feature 02: Note Editor — native TextInput markdown editor with toolbar
- Feature 04: Sync Engine — offline-first sync with SQLite ↔ ns-api
