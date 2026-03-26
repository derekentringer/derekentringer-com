import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { createTokenManager } from "@derekentringer/shared/token";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  LogoutResponse,
  User,
  TotpSetupResponse,
  TotpVerifySetupResponse,
} from "@derekentringer/shared";
import { createMobileTokenAdapter, STORAGE_KEYS } from "./mobileTokenAdapter";

const API_BASE_URL = __DEV__
  ? "http://localhost:3004"
  : "https://ns-api.derekentringer.com";

const adapter = createMobileTokenAdapter();

export const tokenManager = createTokenManager({
  adapter,
  baseUrl: API_BASE_URL,
  logger: __DEV__
    ? { debug: console.debug, warn: console.warn, error: console.error }
    : undefined,
});

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  },
  async setTokens(accessToken: string, refreshToken?: string): Promise<void> {
    const ops: Promise<void>[] = [
      SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
    ];
    if (refreshToken) {
      ops.push(SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refreshToken));
    }
    await Promise.all(ops);
    tokenManager.setAccessToken(accessToken);
  },
  async clearAll(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
    tokenManager.setAccessToken(null);
  },
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Client-Type": "mobile",
  },
});

// Request interceptor: attach Bearer token from TokenManager
api.interceptors.request.use(async (config) => {
  const accessToken = tokenManager.getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor: retry on 401 via TokenManager refresh
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

      const newToken = await tokenManager.refreshAccessToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
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
      await tokenStorage.setTokens(data.accessToken, data.refreshToken);
    }

    return data;
  },

  async refresh(): Promise<string | null> {
    return tokenManager.refreshAccessToken();
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
    await tokenStorage.setTokens(data.accessToken, data.refreshToken);
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

  async forgotPassword(email: string): Promise<void> {
    await api.post("/auth/forgot-password", { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post("/auth/reset-password", { token, newPassword });
  },
};

export default api;
