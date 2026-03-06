import axios from "axios";
import * as SecureStore from "expo-secure-store";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  LogoutResponse,
  User,
  TotpSetupResponse,
  TotpVerifySetupResponse,
  RegisterRequest,
} from "@derekentringer/shared";

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "fin_access_token",
  REFRESH_TOKEN: "fin_refresh_token",
  TOKEN_EXPIRY: "fin_token_expiry",
} as const;

const API_BASE_URL = __DEV__
  ? "http://localhost:3002"
  : "https://fin-api.derekentringer.com";

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  },
  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, token);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  },
  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, token);
  },
  async getTokenExpiry(): Promise<number | null> {
    const val = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN_EXPIRY);
    return val ? Number(val) : null;
  },
  async setTokenExpiry(expiry: number): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN_EXPIRY, String(expiry));
  },
  async clearAll(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN_EXPIRY),
    ]);
  },
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Client-Type": "mobile",
  },
});

// Shared refresh lock to prevent concurrent refresh calls
let refreshPromise: Promise<RefreshResponse | null> | null = null;

async function refreshTokenSafely(): Promise<RefreshResponse | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return null;

      const response = await axios.post<RefreshResponse>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Client-Type": "mobile",
          },
        },
      );

      const data = response.data;
      const expiry = Date.now() + data.expiresIn * 1000;

      await Promise.all([
        tokenStorage.setAccessToken(data.accessToken),
        tokenStorage.setTokenExpiry(expiry),
        ...(data.refreshToken
          ? [tokenStorage.setRefreshToken(data.refreshToken)]
          : []),
      ]);

      return data;
    } catch {
      await tokenStorage.clearAll();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request interceptor: attach Bearer token, proactive refresh if expired
api.interceptors.request.use(async (config) => {
  let accessToken = await tokenStorage.getAccessToken();
  const expiry = await tokenStorage.getTokenExpiry();

  // Proactive refresh if token is expired or about to expire (30s buffer)
  if (expiry && Date.now() > expiry - 30000) {
    const result = await refreshTokenSafely();
    if (result) {
      accessToken = result.accessToken;
    }
  }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Response interceptor: retry on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      originalRequest._retry = true;

      const result = await refreshTokenSafely();
      if (result) {
        originalRequest.headers.Authorization = `Bearer ${result.accessToken}`;
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>(
      "/auth/login",
      credentials,
    );
    const data = response.data;

    // Only store tokens if login is complete (no TOTP required)
    if (!data.requiresTotp) {
      const expiry = Date.now() + data.expiresIn * 1000;
      await Promise.all([
        tokenStorage.setAccessToken(data.accessToken),
        tokenStorage.setTokenExpiry(expiry),
        ...(data.refreshToken
          ? [tokenStorage.setRefreshToken(data.refreshToken)]
          : []),
      ]);
    }

    return data;
  },

  async refresh(): Promise<RefreshResponse | null> {
    return refreshTokenSafely();
  },

  async logout(): Promise<void> {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      await api.post<LogoutResponse>("/auth/logout", { refreshToken });
    } finally {
      await tokenStorage.clearAll();
    }
  },

  async getMe(): Promise<User> {
    const response = await api.get<{ user: User }>("/auth/me");
    return response.data.user;
  },

  async verifyTotp(
    totpToken: string,
    code: string,
  ): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>("/auth/totp/verify", {
      totpToken,
      code,
    });
    const data = response.data;
    const expiry = Date.now() + data.expiresIn * 1000;

    await Promise.all([
      tokenStorage.setAccessToken(data.accessToken),
      tokenStorage.setTokenExpiry(expiry),
      ...(data.refreshToken
        ? [tokenStorage.setRefreshToken(data.refreshToken)]
        : []),
    ]);

    return data;
  },

  async setupTotp(): Promise<TotpSetupResponse> {
    const response = await api.post<TotpSetupResponse>("/auth/totp/setup");
    return response.data;
  },

  async verifyTotpSetup(code: string): Promise<TotpVerifySetupResponse> {
    const response = await api.post<TotpVerifySetupResponse>(
      "/auth/totp/verify-setup",
      { code },
    );
    return response.data;
  },

  async disableTotp(code: string): Promise<void> {
    await api.delete("/auth/totp", { data: { code } });
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await api.post("/auth/change-password", {
      currentPassword,
      newPassword,
    });
  },

  async revokeAllSessions(): Promise<void> {
    await api.post("/auth/sessions/revoke-all");
  },

  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<LoginResponse> {
    const body: RegisterRequest = { email, password };
    if (displayName) body.displayName = displayName;
    const response = await api.post<LoginResponse>("/auth/register", body);
    const data = response.data;
    const expiry = Date.now() + data.expiresIn * 1000;

    await Promise.all([
      tokenStorage.setAccessToken(data.accessToken),
      tokenStorage.setTokenExpiry(expiry),
      ...(data.refreshToken
        ? [tokenStorage.setRefreshToken(data.refreshToken)]
        : []),
    ]);

    return data;
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post("/auth/forgot-password", { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post("/auth/reset-password", { token, newPassword });
  },
};

export default api;
