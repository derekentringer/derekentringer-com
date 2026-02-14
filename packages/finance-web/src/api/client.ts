const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
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
      const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        accessToken = data.accessToken;
        return true;
      }

      accessToken = null;
      if (onAuthFailure) {
        onAuthFailure();
      }
      return false;
    } catch {
      accessToken = null;
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

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && accessToken) {
    const refreshed = await doRefresh();

    if (refreshed) {
      headers.set("Authorization", `Bearer ${accessToken}`);

      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  return response;
}
