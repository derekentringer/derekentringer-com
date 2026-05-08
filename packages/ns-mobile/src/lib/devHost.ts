import { NativeModules, Platform } from "react-native";
import Constants from "expo-constants";

const PROD_API_URL = "https://ns-api.derekentringer.com";
const DEV_API_PORT = 3004;

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
