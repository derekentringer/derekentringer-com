import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { PinProvider } from "./context/PinContext.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { AppLayout } from "./components/AppLayout.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { AccountsPage } from "./pages/AccountsPage.tsx";
import { TransactionsPage } from "./pages/TransactionsPage.tsx";
import { BudgetsPage } from "./pages/BudgetsPage.tsx";
import { BillsPage } from "./pages/BillsPage.tsx";
import { ReportsPage } from "./pages/ReportsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

export function App() {
  return (
    <AuthProvider>
      <PinProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="bills" element={<BillsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </PinProvider>
    </AuthProvider>
  );
}
