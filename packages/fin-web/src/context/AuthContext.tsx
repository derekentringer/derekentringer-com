import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { User, LoginResponse } from "@derekentringer/shared";
import {
  login as apiLogin,
  register as apiRegister,
  refreshSession,
  logout as apiLogout,
  getMe,
} from "../api/auth.ts";
import { setOnAuthFailure } from "../api/client.ts";

interface LoginResult {
  requiresTotp?: boolean;
  totpToken?: string;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserFromLogin: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    window.dispatchEvent(new Event("auth:logout"));
  }, []);

  useEffect(() => {
    setOnAuthFailure(clearAuth);

    refreshSession()
      .then(async (result) => {
        if (result) {
          // Fetch real user data from the server
          try {
            const userData = await getMe();
            setUser(userData);
          } catch {
            // Fallback if /auth/me fails
            setUser(null);
          }
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const response: LoginResponse = await apiLogin({ email, password });

    // If TOTP is required, don't set user yet
    if (response.requiresTotp) {
      return {
        requiresTotp: true,
        totpToken: response.totpToken,
      };
    }

    // If password change is required, set user but signal the caller
    if (response.mustChangePassword) {
      setUser(response.user);
      return { mustChangePassword: true };
    }

    setUser(response.user);
    return {};
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const response = await apiRegister({ email, password, displayName });
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    window.dispatchEvent(new Event("auth:logout"));
  }, []);

  const setUserFromLogin = useCallback((userData: User) => {
    setUser(userData);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        register,
        logout,
        setUserFromLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
