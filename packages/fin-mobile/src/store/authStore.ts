import { create } from "zustand";
import type { User } from "@derekentringer/shared";
import { authApi, tokenStorage } from "@/services/api";

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
