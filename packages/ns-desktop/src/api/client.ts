import { createTokenManager, createApiFetch } from "@derekentringer/shared/token";
import type { AuthFailureReason } from "@derekentringer/shared/token";
import { createDesktopTokenAdapter, REFRESH_TOKEN_KEY } from "./desktopTokenAdapter.ts";
import { setSecureItem, removeSecureItem } from "../lib/secureStorage.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";

const adapter = createDesktopTokenAdapter();

export const tokenManager = createTokenManager({
  adapter,
  baseUrl: BASE_URL,
  logger: import.meta.env.DEV
    ? { debug: console.debug, warn: console.warn, error: console.error }
    : undefined,
});

const apiFetchInternal = createApiFetch(tokenManager, BASE_URL);

// --- Backward-compatible API surface ---

export function setAccessToken(token: string | null): void {
  tokenManager.setAccessToken(token);
}

export function getAccessToken(): string | null {
  return tokenManager.getAccessToken();
}

export async function setRefreshToken(token: string): Promise<void> {
  await setSecureItem(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await removeSecureItem(REFRESH_TOKEN_KEY);
}

export function setOnAuthFailure(callback: () => void): void {
  tokenManager.setOnAuthFailure((_reason: AuthFailureReason) => callback());
}

export async function refreshAccessToken(): Promise<string | null> {
  return tokenManager.refreshAccessToken();
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return apiFetchInternal(path, options);
}
