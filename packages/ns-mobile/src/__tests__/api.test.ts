import * as SecureStore from "expo-secure-store";

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

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

// Mock the shared token module — functions defined inline to avoid hoisting issues
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

// Must import AFTER mocks are set up
import { tokenStorage, tokenManager } from "../services/api";

describe("tokenStorage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAccessToken", () => {
    it("reads from SecureStore", async () => {
      mockGetItemAsync.mockResolvedValue("stored-token");
      const token = await tokenStorage.getAccessToken();
      expect(token).toBe("stored-token");
      expect(mockGetItemAsync).toHaveBeenCalledWith("ns_access_token");
    });
  });

  describe("getRefreshToken", () => {
    it("reads from SecureStore", async () => {
      mockGetItemAsync.mockResolvedValue("stored-refresh");
      const token = await tokenStorage.getRefreshToken();
      expect(token).toBe("stored-refresh");
      expect(mockGetItemAsync).toHaveBeenCalledWith("ns_refresh_token");
    });
  });

  describe("setTokens", () => {
    it("stores tokens in SecureStore and sets in-memory token", async () => {
      await tokenStorage.setTokens("access-123", "refresh-456");

      expect(mockSetItemAsync).toHaveBeenCalledWith("ns_access_token", "access-123");
      expect(mockSetItemAsync).toHaveBeenCalledWith("ns_refresh_token", "refresh-456");
      expect(tokenManager.setAccessToken).toHaveBeenCalledWith("access-123");
    });

    it("skips refresh token storage when not provided", async () => {
      await tokenStorage.setTokens("access-123");

      expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
      expect(mockSetItemAsync).toHaveBeenCalledWith("ns_access_token", "access-123");
      expect(tokenManager.setAccessToken).toHaveBeenCalledWith("access-123");
    });
  });

  describe("clearAll", () => {
    it("clears SecureStore and in-memory token", async () => {
      await tokenStorage.clearAll();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith("ns_access_token");
      expect(mockDeleteItemAsync).toHaveBeenCalledWith("ns_refresh_token");
      expect(tokenManager.setAccessToken).toHaveBeenCalledWith(null);
    });
  });
});

describe("tokenManager export", () => {
  it("exports a tokenManager with expected interface", () => {
    expect(tokenManager).toBeDefined();
    expect(tokenManager.getAccessToken).toBeDefined();
    expect(tokenManager.setAccessToken).toBeDefined();
    expect(tokenManager.refreshAccessToken).toBeDefined();
    expect(tokenManager.setOnAuthFailure).toBeDefined();
    expect(tokenManager.getMsUntilExpiry).toBeDefined();
  });
});
