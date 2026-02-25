import { create } from "zustand";
import type { User } from "@derekentringer/shared";
import { authApi, tokenStorage } from "@/services/api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  pinToken: string | null;
  pinTokenExpiry: number | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyPin: (pin: string) => Promise<void>;
  isPinValid: () => boolean;
}

const useAuthStore = create<AuthState & AuthActions>()((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  pinToken: null,
  pinTokenExpiry: null,

  initialize: async () => {
    try {
      const accessToken = await tokenStorage.getAccessToken();
      const expiry = await tokenStorage.getTokenExpiry();

      if (!accessToken) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      // If token is expired, try to refresh
      if (expiry && Date.now() > expiry) {
        const result = await authApi.refresh();
        if (!result) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }
      }

      // Restore PIN token if available
      const pinToken = await tokenStorage.getPinToken();

      // Single-user app — set placeholder admin user (no /me endpoint)
      set({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: "admin-001",
          username: "admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        pinToken,
      });
    } catch {
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  login: async (username: string, password: string) => {
    const data = await authApi.login({ username, password });
    set({
      isAuthenticated: true,
      user: data.user,
    });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({
        isAuthenticated: false,
        user: null,
        pinToken: null,
        pinTokenExpiry: null,
      });
    }
  },

  verifyPin: async (pin: string) => {
    const data = await authApi.pinVerify(pin);
    set({
      pinToken: data.pinToken,
      pinTokenExpiry: Date.now() + data.expiresIn * 1000,
    });
  },

  isPinValid: () => {
    const { pinToken, pinTokenExpiry } = get();
    if (!pinToken || !pinTokenExpiry) return false;
    return Date.now() < pinTokenExpiry;
  },
}));

export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
export const useIsLoading = () => useAuthStore((state) => state.isLoading);
export const useUser = () => useAuthStore((state) => state.user);

export default useAuthStore;
