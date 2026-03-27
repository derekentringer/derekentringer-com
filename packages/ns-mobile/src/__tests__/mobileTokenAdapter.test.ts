import * as SecureStore from "expo-secure-store";
import { createMobileTokenAdapter, STORAGE_KEYS } from "../services/mobileTokenAdapter";

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("createMobileTokenAdapter", () => {
  let adapter: ReturnType<typeof createMobileTokenAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = createMobileTokenAdapter();
  });

  describe("doRefresh", () => {
    it("returns null when no refresh token in storage", async () => {
      mockGetItemAsync.mockResolvedValue(null);
      const result = await adapter.doRefresh("http://localhost:3004");
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends refresh token in request body and returns result on success", async () => {
      mockGetItemAsync.mockResolvedValue("stored-refresh-token");
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            accessToken: "new-access",
            refreshToken: "new-refresh",
            expiresIn: 900,
          }),
      });

      const result = await adapter.doRefresh("http://localhost:3004");

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3004/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Type": "mobile",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ refreshToken: "stored-refresh-token" }),
      });
      expect(result).toEqual({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 900,
      });
    });

    it("returns null on 401 (definitive auth failure)", async () => {
      mockGetItemAsync.mockResolvedValue("stored-refresh-token");
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const result = await adapter.doRefresh("http://localhost:3004");
      expect(result).toBeNull();
    });

    it("returns null on 403 (definitive auth failure)", async () => {
      mockGetItemAsync.mockResolvedValue("stored-refresh-token");
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const result = await adapter.doRefresh("http://localhost:3004");
      expect(result).toBeNull();
    });

    it("throws on transient server error (preserves session)", async () => {
      mockGetItemAsync.mockResolvedValue("stored-refresh-token");
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(adapter.doRefresh("http://localhost:3004")).rejects.toThrow(
        "Refresh failed with status 500",
      );
    });
  });

  describe("onRefreshSuccess", () => {
    it("persists access and refresh tokens in secure storage", async () => {
      await adapter.onRefreshSuccess({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 900,
      });

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.ACCESS_TOKEN,
        "new-access",
      );
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.REFRESH_TOKEN,
        "new-refresh",
      );
    });

    it("skips refresh token storage when not provided", async () => {
      await adapter.onRefreshSuccess({
        accessToken: "new-access",
        expiresIn: 900,
      });

      expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        STORAGE_KEYS.ACCESS_TOKEN,
        "new-access",
      );
    });
  });

  describe("onAuthFailure", () => {
    it("clears all tokens from secure storage", async () => {
      await adapter.onAuthFailure("token_revoked");

      expect(mockDeleteItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN);
      expect(mockDeleteItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.REFRESH_TOKEN);
    });
  });
});
