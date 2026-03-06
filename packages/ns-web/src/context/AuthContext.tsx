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
  refreshSession,
  logout as apiLogout,
  getMe,
} from "../api/auth.ts";
import { setOnAuthFailure } from "../api/client.ts";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin({ email, password });
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    window.dispatchEvent(new Event("auth:logout"));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
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
