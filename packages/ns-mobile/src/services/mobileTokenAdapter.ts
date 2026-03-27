import * as SecureStore from "expo-secure-store";
import type { TokenRefreshAdapter, RefreshResult } from "@derekentringer/shared/token";

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "ns_access_token",
  REFRESH_TOKEN: "ns_refresh_token",
} as const;

export function createMobileTokenAdapter(): TokenRefreshAdapter {
  return {
    async doRefresh(baseUrl: string): Promise<RefreshResult | null> {
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) return null;

      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Client-Type": "mobile",
        },
        body: JSON.stringify({ refreshToken }),
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
      // Persist tokens in secure storage for app restart survival
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, result.accessToken);
      if (result.refreshToken) {
        await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, result.refreshToken);
      }
    },

    async onAuthFailure(): Promise<void> {
      await Promise.all([
        SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
        SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      ]);
    },
  };
}
