import type { TokenManager } from "./types.js";

/**
 * Create a fetch wrapper that attaches Bearer auth, handles Content-Type,
 * and retries once on 401 after refreshing the access token.
 */
export function createApiFetch(
  tokenManager: TokenManager,
  baseUrl: string,
  defaultFetchOptions?: RequestInit,
): (path: string, options?: RequestInit) => Promise<Response> {
  return async function apiFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    const token = tokenManager.getAccessToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const mergedOptions: RequestInit = {
      ...defaultFetchOptions,
      ...options,
      headers,
    };

    const response = await fetch(`${baseUrl}${path}`, mergedOptions);

    if (response.status === 401 && token) {
      const newToken = await tokenManager.refreshAccessToken();

      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);

        const retryResponse = await fetch(`${baseUrl}${path}`, {
          ...mergedOptions,
          headers,
        });

        return retryResponse;
      }
    }

    return response;
  };
}
