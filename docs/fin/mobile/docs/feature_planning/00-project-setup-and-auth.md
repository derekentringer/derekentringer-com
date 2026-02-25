# Phase 0 — Project Setup & Auth

**Status:** Complete
**Priority:** High
**Completed:** v1.18.0

## Summary

Bootstrap the Expo project in `packages/mobile/`, integrate with the monorepo, establish the dark theme, navigation shell, and complete auth flow with body-based refresh tokens.

## Pre-requisite: API Changes for Mobile Auth

The finance-api delivers refresh tokens exclusively via HttpOnly cookies. React Native cannot read HttpOnly cookies. Before the mobile app can authenticate:

**Modify `packages/shared/src/types/auth.ts`:**
- Add optional `refreshToken?: string` to `LoginResponse` and `RefreshResponse`

**Modify `packages/finance-api/src/routes/auth.ts`:**
- Add `isMobileClient()` helper that checks `X-Client-Type: mobile` header
- On `/auth/login`: when mobile client detected, include `refreshToken` in the JSON response body (alongside the existing cookie)
- On `/auth/refresh`: accept `refreshToken` from request body (`request.body.refreshToken`) in addition to `request.cookies?.refreshToken`
- On `/auth/logout`: accept `refreshToken` from request body for mobile clients

**Modify `packages/finance-api/src/app.ts`:**
- Update CORS origin callback to allow requests with no origin (mobile apps and non-browser clients)

## Config Files

- `packages/mobile/package.json` — name: `@derekentringer/mobile`, deps: expo ~54, react 19.1, react-native 0.81, @react-navigation/bottom-tabs + native + native-stack, @tanstack/react-query ^5, axios ^1, zustand ^5, expo-secure-store, expo-font, react-native-svg, react-native-safe-area-context, react-native-screens, react-native-gesture-handler, react-native-reanimated, @expo/vector-icons
- `packages/mobile/app.json` — name "Fin", slug "fin", portrait, dark theme (`userInterfaceStyle: dark`), `#0f1117` splash background, Android package `com.derekentringer.fin` (edgeToEdge enabled), iOS bundle `com.derekentringer.fin` (NSAllowsLocalNetworking), `newArchEnabled: true`, plugins: expo-font
- `packages/mobile/eas.json` — development/preview/production profiles, all APK (sideload, not app-bundle)
- `packages/mobile/metro.config.js` — monorepo config: `watchFolders` includes workspace root + shared package, `nodeModulesPaths` includes both local and root node_modules, `disableHierarchicalLookup: false`
- `packages/mobile/tsconfig.json` — extends `expo/tsconfig.base`, strict mode, paths: `@/*` → `./src/*`
- `packages/mobile/babel.config.js` — `babel-preset-expo`, `module-resolver` plugin with `@` alias
- `packages/mobile/index.ts` — `registerRootComponent(App)`
- `packages/mobile/App.tsx` — QueryClientProvider (5-min staleTime, 30-min gcTime, 2 retries), SafeAreaProvider, StatusBar (light-content), AppNavigator
- `packages/mobile/jest.config.js`, `jest.setup.js` — test config with mocks for react-native, expo-secure-store, @react-navigation/native, react-native-reanimated, react-native-svg, @expo/vector-icons

## Source Files

- `src/theme/index.ts` — colors matching finance-web CSS vars (background `#0f1117`, card `#12141b`, foreground `#ececec`, primary `#2563eb`, destructive `#dc2626`, border `#1e2028`, muted `#999999`, input `#10121a`, error `#ef4444`, success `#22c55e`, tabInactive `#666666`), spacing (xs/sm/md/lg/xl), borderRadius (sm/md/lg)
- `src/services/api.ts` — Axios client: base URL (`__DEV__` → `http://localhost:3002`, prod → `https://fin-api.derekentringer.com`), `X-Client-Type: mobile` header on all requests, expo-secure-store token management (keys: `fin_access_token`, `fin_refresh_token`, `fin_token_expiry`, `fin_pin_token`), request interceptor for Bearer auth with proactive refresh (30s buffer), response interceptor for 401 auto-refresh, shared refresh lock to prevent concurrent refresh calls
- `src/store/authStore.ts` — Zustand: isAuthenticated, isLoading, user, pinToken/pinTokenExpiry; actions: initialize() (restore from secure store, attempt refresh if expired), login(), logout(), verifyPin(), isPinValid(); selector hooks: useIsAuthenticated(), useIsLoading(), useUser()
- `src/navigation/AppNavigator.tsx` — auth-conditional: loading spinner → AuthStack (Login) or MainTabNavigator (5 bottom tabs)
- `src/screens/LoginScreen.tsx` — KeyboardAvoidingView, FinLogo, username/password fields, Sign In button, error display, loading state
- `src/screens/DashboardScreen.tsx` — placeholder stub
- `src/screens/AccountsScreen.tsx` — placeholder stub
- `src/screens/ActivityScreen.tsx` — placeholder stub
- `src/screens/PlanningScreen.tsx` — placeholder stub
- `src/screens/MoreScreen.tsx` — placeholder stub
- `src/components/FinLogo.tsx` — react-native-svg two-peaks logo (green `#46A851`, blue `#3586C8`)
- `src/__mocks__/` — mocks for react-native, @expo/vector-icons, react-native-svg

## Navigation Architecture

**Bottom Tabs (5):**
1. **Dashboard** (view-dashboard icon) — placeholder
2. **Accounts** (bank icon) — placeholder
3. **Activity** (swap-horizontal icon) — placeholder
4. **Planning** (chart-line icon) — placeholder
5. **More** (dots-horizontal icon) — placeholder

Icons use MaterialCommunityIcons from @expo/vector-icons. Tab bar styled with dark theme colors.

## .gitignore Updates

Added mobile-specific entries: `.expo/`, `android/`, `ios/`, `*.jks`, `*.keystore`, `google-services.json`, `GoogleService-Info.plist`

## Verification

1. `npx turbo run type-check --force` passes (including shared + finance-api changes)
2. `npx turbo run dev` launches Metro bundler alongside other services
3. Login flow works on physical Android device (with `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3002 tcp:3002`)
4. All bottom tabs render with correct placeholder screens
5. Auth state persists across app restarts via expo-secure-store

## Dependencies

- All web features through Phase 6 (mobile consumes the same API)
