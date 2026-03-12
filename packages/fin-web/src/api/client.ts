import { createTokenManager, createApiFetch } from "@derekentringer/shared/token";
import type { AuthFailureReason } from "@derekentringer/shared/token";
import { createWebTokenAdapter } from "./webTokenAdapter.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

const adapter = createWebTokenAdapter();

export const tokenManager = createTokenManager({
  adapter,
  baseUrl: BASE_URL,
  logger: import.meta.env.DEV
    ? { debug: console.debug, warn: console.warn, error: console.error }
    : undefined,
});

const apiFetchInternal = createApiFetch(tokenManager, BASE_URL, {
  credentials: "include",
});

// --- Backward-compatible API surface ---

export function setAccessToken(token: string | null): void {
  tokenManager.setAccessToken(token);
}

export function getAccessToken(): string | null {
  return tokenManager.getAccessToken();
}

export function setOnAuthFailure(callback: () => void): void {
  tokenManager.setOnAuthFailure((_reason: AuthFailureReason) => callback());
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return apiFetchInternal(path, options);
}
