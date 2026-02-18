import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { PinProvider } from "./context/PinContext.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { AccountsPage } from "./pages/AccountsPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

export function App() {
  return (
    <AuthProvider>
      <PinProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <AccountsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </PinProvider>
    </AuthProvider>
  );
}
