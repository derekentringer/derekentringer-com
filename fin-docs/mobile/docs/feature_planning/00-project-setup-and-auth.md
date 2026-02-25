# Phase 0 — Project Setup & Auth

**Status:** Not Started
**Priority:** High

## Summary

Bootstrap the Expo project in `packages/mobile/`, integrate with the monorepo, establish the dark theme, navigation shell, and complete auth flow with body-based refresh tokens.

## Pre-requisite: API Changes for Mobile Auth

The finance-api delivers refresh tokens exclusively via HttpOnly cookies. React Native cannot read HttpOnly cookies. Before the mobile app can authenticate:

**Modify `packages/shared/src/types/auth.ts`:**
- Add optional `refreshToken?: string` to `LoginResponse`

**Modify `packages/finance-api/src/routes/auth.ts`:**
- On `/auth/login`: when `X-Client-Type: mobile` header is present, also include `refreshToken` in the JSON response body (alongside the existing cookie)
- On `/auth/refresh`: when `X-Client-Type: mobile` header is present, accept `refreshToken` from request body (`request.body.refreshToken`) in addition to `request.cookies?.refreshToken`

No CORS changes needed — React Native makes native HTTP requests that bypass CORS entirely.

## Config Files

- `packages/mobile/package.json` — name: `@derekentringer/mobile`, deps matching VoidForge versions (expo ~54, react 19.1, react-native 0.81, @react-navigation/*, @tanstack/react-query ^5, axios ^1, zustand ^5, expo-secure-store, expo-notifications, expo-device, expo-font, react-native-chart-kit, react-native-svg, react-native-safe-area-context, react-native-screens, react-native-gesture-handler, react-native-reanimated, react-native-pager-view, @expo/vector-icons, @expo-google-fonts/roboto, expo-haptics, @react-native-community/netinfo)
- `packages/mobile/app.json` — name "FinDash", slug "findash", portrait, dark theme, `#0f1117` splash background, Android package `com.derekentringer.findash`, iOS bundle `com.derekentringer.findash`, `newArchEnabled: true`, plugins: expo-font, expo-notifications
- `packages/mobile/eas.json` — development/preview/production profiles, all APK (sideload, not app-bundle)
- `packages/mobile/metro.config.js` — monorepo config: `watchFolders` includes workspace root, `nodeModulesPaths` includes both local and root node_modules, `extraNodeModules` maps `@derekentringer/shared` to shared package
- `packages/mobile/tsconfig.json` — extends `expo/tsconfig.base`, paths: `@/*` → `./src/*`
- `packages/mobile/babel.config.js` — `babel-preset-expo`
- `packages/mobile/index.ts` — `registerRootComponent(App)`
- `packages/mobile/App.tsx` — QueryClientProvider, SafeAreaProvider, StatusBar (light-content), font loading, AppNavigator
- `packages/mobile/jest.config.js`, `jest.setup.js` — test config with mocks for native modules

## Source Files

- `src/theme/index.ts` — colors matching finance-web CSS vars (background `#0f1117`, card `#12141b`, foreground `#ececec`, primary `#2563eb`, etc.), spacing, borderRadius constants
- `src/theme/typography.ts` — text style presets (heading, body, caption, label) using Roboto
- `src/services/api.ts` — Axios client: base URL (`__DEV__` → `http://localhost:3002`, prod → `https://fin-api.derekentringer.com`), `X-Client-Type: mobile` header on all requests, expo-secure-store token management (keys: `fin_access_token`, `fin_refresh_token`, `fin_token_expiry`, `fin_pin_token`), request interceptor for Bearer auth, response interceptor for 401 auto-refresh via body-based refresh token
- `src/store/authStore.ts` — Zustand: isAuthenticated, isLoading, user, pinToken/pinTokenExpiry; actions: initialize() (restore from secure store), login(), logout(), verifyPin(), isPinValid()
- `src/navigation/AppNavigator.tsx` — auth-conditional: LoadingScreen → AuthStack (Login) or MainTabs + modal stack
- `src/navigation/types.ts` — TypeScript param lists for all stacks
- `src/screens/LoginScreen.tsx` — dark theme login form with FinLogo
- `src/components/FinLogo.tsx` — SVG logo (port from web's inline SVG)

## Navigation Architecture

**Bottom Tabs (5):**
1. **Dashboard** — KPIs, charts, upcoming bills, goals summary, AI insights
2. **Accounts** — Account groups → account list → account detail + balance history
3. **Activity** — Top tabs: Transactions, Bills, Budgets
4. **Planning** — Top tabs: Goals, Projections, Decision Tools
5. **More** — Reports, Portfolio, Settings, Notifications

Root Stack wraps tabs and provides modal screens for all create/edit forms and PIN verification.

## .gitignore Updates

Add mobile-specific entries: `.expo/`, `*.jks`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`

## Verification

1. `npx turbo run type-check --force` passes (including shared + finance-api changes)
2. `cd packages/mobile && npx expo start` launches Metro bundler
3. Login flow works on Android emulator (with `adb reverse tcp:3002 tcp:3002`)
4. All bottom tabs render with correct screens

## Dependencies

- All web features through Phase 6 (mobile consumes the same API)
