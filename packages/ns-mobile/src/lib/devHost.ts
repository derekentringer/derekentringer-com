import { NativeModules, Platform } from "react-native";
import Constants from "expo-constants";

const PROD_API_URL = "https://ns-api.derekentringer.com";
const DEV_API_PORT = 3004;

// Highest-priority override: set at build time via Expo's `EXPO_PUBLIC_*`
// env vars, which Metro inlines into the JS bundle at bundling time.
// Pairs with the `APP_VARIANT` toggle in `app.config.ts` to produce a
// fully standalone "dev variant" install that talks to localhost (or a
// staging URL, or any URL the build script provides) without needing
// `__DEV__=true` / Metro running at launch.
//
//   APP_VARIANT=dev EXPO_PUBLIC_API_URL=http://localhost:3004 \
//     npx expo run:android --variant release
//
//   APP_VARIANT=dev EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:3004 \
//     npx expo run:ios --device <UDID> --configuration Release
//
// iOS gotcha: `localhost` on the iPhone means the iPhone itself. For
// iOS to reach the Mac's local API, the env var must be the Mac's LAN
// IP (e.g., `http://192.168.0.119:3004`). Re-bake when the network
// changes. Android works with `localhost` via `adb reverse`.
const BUILD_TIME_API_URL = process.env.EXPO_PUBLIC_API_URL;

function readScriptURL(): string | undefined {
  const sourceCode: any = NativeModules.SourceCode;
  if (!sourceCode) return undefined;
  if (typeof sourceCode.getConstants === "function") {
    const c = sourceCode.getConstants();
    if (typeof c?.scriptURL === "string") return c.scriptURL;
  }
  if (typeof sourceCode.scriptURL === "string") return sourceCode.scriptURL;
  return undefined;
}

function readExpoHost(): string | undefined {
  const fromExpoGo = (Constants as any).expoGoConfig?.hostUri;
  if (typeof fromExpoGo === "string") return fromExpoGo.split(":")[0];
  const fromExpo = (Constants as any).expoConfig?.hostUri;
  if (typeof fromExpo === "string") return fromExpo.split(":")[0];
  return undefined;
}

export function getApiBaseUrl(): string {
  // Explicit build-time override always wins. Lets a Release-config
  // build target a non-prod backend (the standalone dev-variant flow).
  if (BUILD_TIME_API_URL) return BUILD_TIME_API_URL;
  if (!__DEV__) return PROD_API_URL;
  const scriptURL = readScriptURL();
  if (scriptURL) {
    try {
      const url = new URL(scriptURL);
      if (url.hostname && url.hostname !== "0.0.0.0") {
        return `http://${url.hostname}:${DEV_API_PORT}`;
      }
    } catch {
      // fall through
    }
  }
  const expoHost = readExpoHost();
  if (expoHost) return `http://${expoHost}:${DEV_API_PORT}`;
  // iOS device cannot reach Mac via "localhost" — there is no adb-reverse equivalent.
  // Android can reach Mac via "localhost" through `adb reverse`.
  if (Platform.OS === "android") return `http://localhost:${DEV_API_PORT}`;
  return PROD_API_URL;
}
