import type { TokenRefreshAdapter, RefreshResult } from "@derekentringer/shared/token";

export function createWebTokenAdapter(): TokenRefreshAdapter {
  return {
    async doRefresh(baseUrl: string): Promise<RefreshResult | null> {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
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

    onRefreshSuccess(): void {
      // No-op: refresh token managed by server via httpOnly cookie
    },

    onAuthFailure(): void {
      // No-op: cookie cleared by server; AuthContext handles UI cleanup
    },

    fetchOptions: {
      credentials: "include",
    },
  };
}
