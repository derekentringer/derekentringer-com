import * as SecureStore from "expo-secure-store";

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;

// Mock the token adapter
jest.mock("../services/mobileTokenAdapter", () => ({
  STORAGE_KEYS: {
    ACCESS_TOKEN: "ns_access_token",
    REFRESH_TOKEN: "ns_refresh_token",
  },
  createMobileTokenAdapter: () => ({
    doRefresh: jest.fn().mockResolvedValue(null),
    onRefreshSuccess: jest.fn(),
    onAuthFailure: jest.fn(),
  }),
}));

// Mock createTokenManager — all mocks inline to avoid hoisting issues
jest.mock("@derekentringer/shared/token", () => ({
  createTokenManager: jest.fn(() => ({
    setAccessToken: jest.fn(),
    getAccessToken: jest.fn().mockReturnValue(null),
    refreshAccessToken: jest.fn().mockResolvedValue(null),
    setOnAuthFailure: jest.fn(),
    getMsUntilExpiry: jest.fn().mockReturnValue(null),
    getTokenExpiryMs: jest.fn().mockReturnValue(null),
    destroy: jest.fn(),
  })),
}));

// Mock axios to avoid real HTTP calls
jest.mock("axios", () => {
  const mockAxios: Record<string, any> = {
    create: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { __esModule: true, default: mockAxios };
});

import useAuthStore from "../store/authStore";
import { tokenManager } from "../services/api";

describe("authStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });
  });

  describe("initialize", () => {
    it("sets isLoading false and isAuthenticated false when no token", async () => {
      mockGetItemAsync.mockResolvedValue(null);

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it("registers auth failure callback", async () => {
      mockGetItemAsync.mockResolvedValue(null);

      await useAuthStore.getState().initialize();

      expect(tokenManager.setOnAuthFailure).toHaveBeenCalledWith(expect.any(Function));
    });

    it("attempts refresh when token is expired", async () => {
      mockGetItemAsync.mockResolvedValue("expired-token");
      (tokenManager.getMsUntilExpiry as jest.Mock).mockReturnValue(0);
      (tokenManager.refreshAccessToken as jest.Mock).mockResolvedValue(null);

      await useAuthStore.getState().initialize();

      expect(tokenManager.refreshAccessToken).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe("login", () => {
    it("returns requiresTotp when TOTP is needed", async () => {
      const apiModule = require("../services/api");
      apiModule.authApi.login = jest.fn().mockResolvedValue({
        requiresTotp: true,
        totpToken: "totp-token-123",
      });

      const result = await useAuthStore.getState().login("test@test.com", "password");

      expect(result.requiresTotp).toBe(true);
      expect(result.totpToken).toBe("totp-token-123");
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("sets authenticated state on successful login", async () => {
      const apiModule = require("../services/api");
      apiModule.authApi.login = jest.fn().mockResolvedValue({
        requiresTotp: false,
        user: { id: "1", email: "test@test.com" },
        accessToken: "token",
        refreshToken: "refresh",
      });

      const result = await useAuthStore.getState().login("test@test.com", "password");

      expect(result.requiresTotp).toBeUndefined();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({ id: "1", email: "test@test.com" });
    });
  });

  describe("verifyTotp", () => {
    it("sets authenticated state after TOTP verification", async () => {
      const apiModule = require("../services/api");
      apiModule.authApi.verifyTotp = jest.fn().mockResolvedValue({
        user: { id: "1", email: "test@test.com" },
        accessToken: "token",
        refreshToken: "refresh",
      });

      await useAuthStore.getState().verifyTotp("totp-token", "123456");

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({ id: "1", email: "test@test.com" });
    });
  });

  describe("logout", () => {
    it("clears auth state", async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: "1", email: "test@test.com" } as any,
      });

      const apiModule = require("../services/api");
      apiModule.authApi.logout = jest.fn().mockResolvedValue(undefined);

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it("clears state even if API call fails", async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: "1", email: "test@test.com" } as any,
      });

      const apiModule = require("../services/api");
      apiModule.authApi.logout = jest.fn().mockRejectedValue(new Error("Network error"));

      // logout uses try/finally, so error propagates — catch it
      try {
        await useAuthStore.getState().logout();
      } catch {
        // expected
      }

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });
});
