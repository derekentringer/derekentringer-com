# Fin — Mobile App

Personal finance mobile app built with Expo and React Native. Part of the [derekentringer.com](https://derekentringer.com) monorepo.

## Prerequisites

- Node.js (see root `.nvmrc`)
- Expo CLI (`npx expo`)
- Android device with USB debugging enabled
- `adb` (Android Debug Bridge) installed

## Development Setup

```bash
# From the repo root
npm install

# Connect Android device via USB, then set up port forwarding
adb reverse tcp:8081 tcp:8081   # Metro bundler
adb reverse tcp:3002 tcp:3002   # Finance API

# Start the finance API (from repo root)
npx turbo run dev --filter=@derekentringer/finance-api

# Start the app on a connected Android device (from packages/mobile/)
npx expo run:android
```

The dev API runs at `http://localhost:3002`, which the app reaches via the `adb reverse` tunnel. Re-run `adb reverse` after disconnecting/reconnecting the device.

## Project Structure

```
src/
  screens/        — Screen components (Dashboard, Accounts, Transactions, etc.)
  components/     — Reusable UI components organized by feature
  hooks/          — Custom React hooks (queries, mutations, data transforms)
  api/            — Axios client with auth interceptor
  services/       — Push notifications, storage utilities
  store/          — Zustand stores (auth, preferences)
  navigation/     — React Navigation setup (bottom tabs + native stacks)
  theme/          — Colors, spacing, border radius tokens
```

## Build (EAS)

```bash
# Development build (includes dev client)
eas build --platform android --profile development

# Preview build (internal distribution APK)
eas build --platform android --profile preview

# Production build (release APK)
eas build --platform android --profile production
```

All Android profiles produce APK files for sideloading (no Play Store).

## Environment

| Variable | Dev | Production |
|----------|-----|------------|
| API URL | `http://localhost:3002` (via adb reverse) | `https://fin-api.derekentringer.com` |
| Firebase | `google-services.json` (gitignored) | Same file, configured in EAS |

## Type Checking

```bash
# From packages/mobile/
npm run type-check

# Or from repo root
npx turbo run type-check --filter=@derekentringer/mobile
```
