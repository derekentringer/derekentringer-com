import type {
  TokenManager,
  TokenManagerOptions,
  AuthFailureReason,
} from "./types.js";
import { getTokenExpiryMs } from "./parseJwt.js";

const DEFAULT_REFRESH_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_REFRESH_CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds

export function createTokenManager(options: TokenManagerOptions): TokenManager {
  const {
    adapter,
    baseUrl,
    refreshThresholdMs = DEFAULT_REFRESH_THRESHOLD_MS,
    refreshCheckIntervalMs = DEFAULT_REFRESH_CHECK_INTERVAL_MS,
    logger,
  } = options;

  let accessToken: string | null = null;
  let onAuthFailureCallback: ((reason: AuthFailureReason) => void) | null = null;
  let refreshPromise: Promise<boolean> | null = null;
  let proactiveRefreshTimer: ReturnType<typeof setInterval> | null = null;

  function startProactiveRefresh(): void {
    stopProactiveRefresh();
    proactiveRefreshTimer = setInterval(() => {
      if (!accessToken) return;
      const exp = getTokenExpiryMs(accessToken);
      if (exp && exp - Date.now() < refreshThresholdMs) {
        logger?.debug("Proactive refresh: token near expiry, refreshing");
        doRefresh();
      }
    }, refreshCheckIntervalMs);
  }

  function stopProactiveRefresh(): void {
    if (proactiveRefreshTimer) {
      clearInterval(proactiveRefreshTimer);
      proactiveRefreshTimer = null;
    }
  }

  function handleAuthFailure(reason: AuthFailureReason): void {
    accessToken = null;
    stopProactiveRefresh();
    adapter.onAuthFailure(reason);
    onAuthFailureCallback?.(reason);
    logger?.warn(`Auth failure: ${reason}`);
  }

  async function doRefresh(): Promise<boolean> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const result = await adapter.doRefresh(baseUrl);

        if (result) {
          accessToken = result.accessToken;
          await adapter.onRefreshSuccess(result);
          logger?.debug("Token refresh successful");
          return true;
        }

        // Adapter returned null — definitive failure
        handleAuthFailure("token_revoked");
        return false;
      } catch (err) {
        // Network/transient error — don't destroy session
        logger?.error(
          `Token refresh error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  return {
    getAccessToken(): string | null {
      return accessToken;
    },

    setAccessToken(token: string | null): void {
      accessToken = token;
      if (token) {
        startProactiveRefresh();
      } else {
        stopProactiveRefresh();
      }
    },

    async refreshAccessToken(): Promise<string | null> {
      const ok = await doRefresh();
      return ok ? accessToken : null;
    },

    setOnAuthFailure(callback: (reason: AuthFailureReason) => void): void {
      onAuthFailureCallback = callback;
    },

    getTokenExpiryMs(): number | null {
      if (!accessToken) return null;
      return getTokenExpiryMs(accessToken);
    },

    getMsUntilExpiry(): number | null {
      if (!accessToken) return null;
      const exp = getTokenExpiryMs(accessToken);
      if (!exp) return null;
      return exp - Date.now();
    },

    destroy(): void {
      stopProactiveRefresh();
      accessToken = null;
      onAuthFailureCallback = null;
      refreshPromise = null;
    },
  };
}
