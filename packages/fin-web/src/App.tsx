import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { AccountTypesProvider } from "./context/AccountTypesContext.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { AppLayout } from "./components/AppLayout.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { RegisterPage } from "./pages/RegisterPage.tsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.tsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { AccountTypePage } from "./pages/AccountTypePage.tsx";
import { TransactionsPage } from "./pages/TransactionsPage.tsx";
import { BudgetsPage } from "./pages/BudgetsPage.tsx";
import { BillsPage } from "./pages/BillsPage.tsx";
import { ReportsPage } from "./pages/ReportsPage.tsx";
import { ProjectionsPage } from "./pages/ProjectionsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { GoalsPage } from "./pages/GoalsPage.tsx";
import { DecisionToolsPage } from "./pages/DecisionToolsPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

export function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute><AccountTypesProvider><AppLayout /></AccountTypesProvider></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="projections/:tab?" element={<ProjectionsPage />} />
            <Route path="accounts/:typeSlug/:tab?" element={<AccountTypePage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="bills/:tab?" element={<BillsPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="decision-tools/:tab?" element={<DecisionToolsPage />} />
            <Route path="reports/:tab?" element={<ReportsPage />} />
            <Route path="settings/:tab?" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
    </AuthProvider>
    </ErrorBoundary>
  );
}
