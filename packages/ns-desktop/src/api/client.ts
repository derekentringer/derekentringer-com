import { getSecureItem, setSecureItem, removeSecureItem } from "../lib/secureStorage.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";

const REFRESH_TOKEN_KEY = "ns-desktop:refreshToken";

let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function setRefreshToken(token: string): Promise<void> {
  await setSecureItem(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await removeSecureItem(REFRESH_TOKEN_KEY);
}

export function setOnAuthFailure(callback: () => void): void {
  onAuthFailure = callback;
}

async function doRefresh(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const storedRefresh = await getSecureItem(REFRESH_TOKEN_KEY);
      if (!storedRefresh) {
        accessToken = null;
        if (onAuthFailure) {
          onAuthFailure();
        }
        return false;
      }

      const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        accessToken = data.accessToken;
        if (data.refreshToken) {
          await setSecureItem(REFRESH_TOKEN_KEY, data.refreshToken);
        }
        return true;
      }

      accessToken = null;
      await removeSecureItem(REFRESH_TOKEN_KEY);
      if (onAuthFailure) {
        onAuthFailure();
      }
      return false;
    } catch {
      accessToken = null;
      await removeSecureItem(REFRESH_TOKEN_KEY);
      if (onAuthFailure) {
        onAuthFailure();
      }
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && accessToken) {
    const refreshed = await doRefresh();

    if (refreshed) {
      headers.set("Authorization", `Bearer ${accessToken}`);

      const retryResponse = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (retryResponse.status === 401 && onAuthFailure) {
        onAuthFailure();
      }

      return retryResponse;
    }
  }

  return response;
}
