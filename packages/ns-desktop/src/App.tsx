import { useEffect, useState } from "react";
import { NotesPage } from "./pages/NotesPage.tsx";
import { AuthProvider, useAuth } from "./context/AuthContext.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { RegisterPage } from "./pages/RegisterPage.tsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.tsx";

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

type AuthView = "login" | "register" | "forgot-password";

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

    function handleStorage(e: StorageEvent) {
      if (e.key === "ns-editor-settings") applyTheme();
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authView, setAuthView] = useState<AuthView>("login");

  if (isLoading) return null;

  if (!isAuthenticated) {
    switch (authView) {
      case "register":
        return <RegisterPage onNavigate={setAuthView} />;
      case "forgot-password":
        return <ForgotPasswordPage onNavigate={setAuthView} />;
      default:
        return <LoginPage onNavigate={setAuthView} />;
    }
  }

  return <NotesPage />;
}

export function App() {
  useThemeAttribute();

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
