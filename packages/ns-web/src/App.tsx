import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.tsx";
import { CommandProvider, useShortcuts } from "./commands/index.ts";
import { LoginPage } from "./pages/LoginPage.tsx";
import { RegisterPage } from "./pages/RegisterPage.tsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.tsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.tsx";
import { ChangePasswordPage } from "./pages/ChangePasswordPage.tsx";
import { NotesPage } from "./pages/NotesPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

const ACCENT_PRESETS: Record<string, { dark: string; light: string; darkHover: string; lightHover: string }> = {
  lime:   { dark: "#d4e157", light: "#7c8a00", darkHover: "#c0ca33", lightHover: "#636e00" },
  blue:   { dark: "#42a5f5", light: "#1565c0", darkHover: "#1e88e5", lightHover: "#0d47a1" },
  cyan:   { dark: "#26c6da", light: "#00838f", darkHover: "#00acc1", lightHover: "#006064" },
  purple: { dark: "#ab47bc", light: "#7b1fa2", darkHover: "#8e24aa", lightHover: "#6a1b9a" },
  orange: { dark: "#ffa726", light: "#e65100", darkHover: "#fb8c00", lightHover: "#bf360c" },
  teal:   { dark: "#26a69a", light: "#00695c", darkHover: "#00897b", lightHover: "#004d40" },
  pink:   { dark: "#ec407a", light: "#c2185b", darkHover: "#d81b60", lightHover: "#ad1457" },
  red:    { dark: "#ef5350", light: "#c62828", darkHover: "#e53935", lightHover: "#b71c1c" },
  amber:  { dark: "#ffca28", light: "#ff8f00", darkHover: "#ffb300", lightHover: "#e65100" },
  black:  { dark: "#b0b0b0", light: "#1a1a1a", darkHover: "#9e9e9e", lightHover: "#000000" },
  white:  { dark: "#ffffff", light: "#666666", darkHover: "#e0e0e0", lightHover: "#444444" },
};

function applyAccentCssVars(theme: string, accentColor: string) {
  const preset = ACCENT_PRESETS[accentColor] || ACCENT_PRESETS.lime;
  const isLight = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  const primary = isLight ? preset.light : preset.dark;
  const hover = isLight ? preset.lightHover : preset.darkHover;
  const contrast = accentColor === "black" ? "#ffffff" : "#000000";
  document.documentElement.style.setProperty("--color-primary", primary);
  document.documentElement.style.setProperty("--color-primary-hover", hover);
  document.documentElement.style.setProperty("--color-primary-contrast", contrast);
  document.documentElement.style.setProperty("--color-ring", primary);
}

function useThemeAttribute() {
  useEffect(() => {
    function applyTheme() {
      try {
        const raw = localStorage.getItem("ns-editor-settings");
        const parsed = raw ? JSON.parse(raw) : {};
        const theme = parsed.theme || "dark";
        const accentColor = parsed.accentColor || "lime";
        if (theme === "dark" || theme === "light" || theme === "system") {
          document.documentElement.setAttribute("data-theme", theme);
        } else {
          document.documentElement.setAttribute("data-theme", "dark");
        }
        applyAccentCssVars(theme, accentColor);
      } catch {
        document.documentElement.setAttribute("data-theme", "dark");
        applyAccentCssVars("dark", "lime");
      }
    }

    applyTheme();

    // Re-apply when localStorage changes (e.g., from settings page)
    function handleStorage(e: StorageEvent) {
      if (e.key === "ns-editor-settings") applyTheme();
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
}

function ShortcutDispatcher({ children }: { children: React.ReactNode }) {
  useShortcuts();
  return <>{children}</>;
}

export function App() {
  useThemeAttribute();

  return (
    <CommandProvider>
    <ShortcutDispatcher>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <NotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes/:noteId"
          element={
            <ProtectedRoute>
              <NotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
    </ShortcutDispatcher>
    </CommandProvider>
  );
}
