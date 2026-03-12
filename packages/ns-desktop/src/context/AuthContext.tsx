import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { User } from "@derekentringer/shared";
import {
  login as apiLogin,
  register as apiRegister,
  refreshSession,
  logout as apiLogout,
  getMe,
} from "../api/auth.ts";
import { tokenManager } from "../api/client.ts";
import type { AuthFailureReason } from "@derekentringer/shared/token";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserFromLogin: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback((reason?: AuthFailureReason) => {
    setUser(null);
    window.dispatchEvent(
      new CustomEvent("auth:logout", { detail: { reason } }),
    );
  }, []);

  useEffect(() => {
    tokenManager.setOnAuthFailure((reason) => clearAuth(reason));

    refreshSession()
      .then(async (result) => {
        if (result) {
          try {
            const userData = await getMe();
            setUser(userData);
          } catch {
            setUser(null);
          }
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin({ email, password });
    if (response.user) {
      setUser(response.user);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const response = await apiRegister({ email, password, displayName });
    if (response.user) {
      setUser(response.user);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
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
