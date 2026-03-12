import type { TokenRefreshAdapter, RefreshResult, AuthFailureReason } from "@derekentringer/shared/token";
import { getSecureItem, setSecureItem, removeSecureItem } from "../lib/secureStorage.ts";

const REFRESH_TOKEN_KEY = "ns-desktop:refreshToken";

/**
 * Read refresh token from Stronghold with one retry (vault reads can transiently fail).
 */
async function readRefreshToken(): Promise<string | null> {
  const first = await getSecureItem(REFRESH_TOKEN_KEY);
  if (first) return first;
  await new Promise((r) => setTimeout(r, 200));
  return getSecureItem(REFRESH_TOKEN_KEY);
}

export function createDesktopTokenAdapter(): TokenRefreshAdapter {
  return {
    async doRefresh(baseUrl: string): Promise<RefreshResult | null> {
      const storedRefresh = await readRefreshToken();
      if (!storedRefresh) {
        return null;
      }

      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
        };
      }

      // Definitive auth failure — token revoked/invalid
      if (response.status === 401 || response.status === 403) {
        return null;
      }

      // Transient server error (500, etc.) — throw to preserve session
      throw new Error(`Refresh failed with status ${response.status}`);
    },

    async onRefreshSuccess(result: RefreshResult): Promise<void> {
      if (result.refreshToken) {
        await setSecureItem(REFRESH_TOKEN_KEY, result.refreshToken);
      }
    },

    async onAuthFailure(_reason: AuthFailureReason): Promise<void> {
      await removeSecureItem(REFRESH_TOKEN_KEY);
      window.dispatchEvent(new Event("auth:logout"));
    },
  };
}

export { REFRESH_TOKEN_KEY };
