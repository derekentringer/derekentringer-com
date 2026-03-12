/** Reason the auth session was terminated */
export type AuthFailureReason =
  | "token_expired"
  | "token_revoked"
  | "no_refresh_token"
  | "network_error"
  | "unknown";

/** Result returned by a successful token refresh */
export interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/** Optional debug/diagnostic logger */
export interface TokenLogger {
  debug: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Platform-specific adapter for token refresh and persistence.
 * Desktop: Stronghold vault + body-based refresh
 * Web: Cookie-based refresh (credentials: include)
 */
export interface TokenRefreshAdapter {
  /** Execute the refresh HTTP call. Return null on definitive failure. */
  doRefresh: (baseUrl: string) => Promise<RefreshResult | null>;
  /** Called after a successful refresh (e.g. store new refresh token) */
  onRefreshSuccess: (result: RefreshResult) => Promise<void> | void;
  /** Called when auth definitively fails (e.g. clear stored tokens) */
  onAuthFailure: (reason: AuthFailureReason) => Promise<void> | void;
  /** Extra fetch options merged into apiFetch calls (e.g. credentials: "include") */
  fetchOptions?: RequestInit;
}

/** Options for createTokenManager */
export interface TokenManagerOptions {
  adapter: TokenRefreshAdapter;
  baseUrl: string;
  /** Refresh when token has less than this many ms remaining. Default: 120_000 (2 min) */
  refreshThresholdMs?: number;
  /** How often to check token freshness. Default: 60_000 (60s) */
  refreshCheckIntervalMs?: number;
  /** Optional debug logger */
  logger?: TokenLogger;
}

/** The TokenManager interface returned by createTokenManager */
export interface TokenManager {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  refreshAccessToken: () => Promise<string | null>;
  setOnAuthFailure: (callback: (reason: AuthFailureReason) => void) => void;
  getTokenExpiryMs: () => number | null;
  getMsUntilExpiry: () => number | null;
  destroy: () => void;
}
