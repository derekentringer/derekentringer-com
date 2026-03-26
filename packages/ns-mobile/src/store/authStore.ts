import { create } from "zustand";
import type { User } from "@derekentringer/shared";
import { authApi, tokenStorage, tokenManager } from "@/services/api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
}

interface LoginResult {
  requiresTotp?: boolean;
  totpToken?: string;
  mustChangePassword?: boolean;
}

interface AuthActions {
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  verifyTotp: (totpToken: string, code: string) => Promise<void>;
  setUser: (user: User) => void;
}

const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,

  initialize: async () => {
    try {
      // Register auth failure callback to clear state on token revocation
      tokenManager.setOnAuthFailure(() => {
        set({ isAuthenticated: false, user: null });
      });

      const accessToken = await tokenStorage.getAccessToken();

      if (!accessToken) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      // Load persisted token into TokenManager's in-memory store
      tokenManager.setAccessToken(accessToken);

      // If token is expired or near-expiry, refresh
      const msUntilExpiry = tokenManager.getMsUntilExpiry();
      if (msUntilExpiry === null || msUntilExpiry <= 0) {
        const newToken = await tokenManager.refreshAccessToken();
        if (!newToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }
      }

      // Fetch real user data from the API
      const user = await authApi.getMe();

      set({
        isAuthenticated: true,
        isLoading: false,
        user,
      });
    } catch {
      await tokenStorage.clearAll();
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  login: async (email: string, password: string): Promise<LoginResult> => {
    const data = await authApi.login({ email, password });

    if (data.requiresTotp) {
      return {
        requiresTotp: true,
        totpToken: data.totpToken,
      };
    }

    set({
      isAuthenticated: true,
      user: data.user,
    });

    return { mustChangePassword: data.mustChangePassword };
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({
        isAuthenticated: false,
        user: null,
      });
    }
  },

  verifyTotp: async (totpToken: string, code: string) => {
    const data = await authApi.verifyTotp(totpToken, code);
    set({
      isAuthenticated: true,
      user: data.user,
    });
  },

  setUser: (user: User) => {
    set({ user });
  },
}));

export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
export const useIsLoading = () => useAuthStore((state) => state.isLoading);
export const useUser = () => useAuthStore((state) => state.user);

export default useAuthStore;
