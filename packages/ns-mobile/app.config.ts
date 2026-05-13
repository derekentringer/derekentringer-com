import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Dynamic Expo config. Replaces the static `app.json` so we can vary
 * the bundle identifier + display name per build flavor, which lets
 * a prod-installed app and a dev-installed app coexist on the same
 * device.
 *
 *   APP_VARIANT=dev npx expo run:android      → installs com.derekentringer.notesync.dev
 *   APP_VARIANT=dev npx expo run:ios ...      → installs com.derekentringer.notesync.dev
 *   (no APP_VARIANT)  → prod identifier, same as before
 *
 * After flipping APP_VARIANT for the first time on a given platform,
 * run `npx expo prebuild --platform <p> --clean` once so the native
 * project regenerates with the new identifier baked into AndroidManifest
 * + Info.plist + the share extension target. Subsequent builds reuse it.
 *
 * API URL toggling is handled separately by `src/lib/devHost.ts`:
 * `__DEV__` is true in debug builds → talks to local API; false in
 * release builds → talks to PROD_API_URL. So a Debug + APP_VARIANT=dev
 * build is "dev variant against local API"; a Release + APP_VARIANT=dev
 * build is "dev variant against production API" — useful for one-off
 * dev-channel testing where you want the dev icon/name but real data.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.APP_VARIANT === "dev";
  const baseIdentifier = "com.derekentringer.notesync";
  const identifier = isDev ? `${baseIdentifier}.dev` : baseIdentifier;
  const displayName = isDev ? "NoteSync (Dev)" : "NoteSync";

  return {
    ...config,
    name: displayName,
    slug: "notesync",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0f1117",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: identifier,
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
        UIBackgroundModes: ["audio"],
        NSPhotoLibraryUsageDescription:
          `Allow ${displayName} to read photos from your library so you can attach them to your notes.`,
        NSCameraUsageDescription:
          `Allow ${displayName} to use the camera so you can take a photo and attach it to a note.`,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0f1117",
      },
      package: identifier,
      edgeToEdgeEnabled: true,
    },
    scheme: "notesync",
    plugins: [
      "expo-font",
      "expo-sqlite",
      [
        "expo-audio",
        {
          microphonePermission:
            `Allow ${displayName} to access your microphone so you can record voice memos.`,
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            `Allow ${displayName} to read photos from your library so you can attach them to your notes.`,
          cameraPermission:
            `Allow ${displayName} to use the camera so you can take a photo and attach it to a note.`,
        },
      ],
      [
        "expo-share-intent",
        {
          androidIntentFilters: ["text/*", "image/*"],
          iosActivationRules: {
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1,
            NSExtensionActivationSupportsImageWithMaxCount: 1,
          },
        },
      ],
      // Android Release builds block cleartext HTTP (API 28+) by
      // default, which makes the dev-variant `EXPO_PUBLIC_API_URL=
      // http://localhost:3004` round-trip silently fail. Only the
      // dev variant flips this on; prod stays HTTPS-only. iOS has
      // the equivalent allowance via `NSAllowsLocalNetworking` in
      // the Info.plist above, which is broad enough that no per-
      // variant toggle is needed there.
      ...(isDev
        ? [
            [
              "expo-build-properties",
              { android: { usesCleartextTraffic: true } },
            ] as unknown as ExpoConfig["plugins"] extends (infer P)[] ? P : never,
          ]
        : []),
    ],
  };
};
