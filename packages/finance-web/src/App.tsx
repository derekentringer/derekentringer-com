import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { PinProvider } from "./context/PinContext.tsx";
import { AccountTypesProvider } from "./context/AccountTypesContext.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { AppLayout } from "./components/AppLayout.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { AccountTypePage } from "./pages/AccountTypePage.tsx";
import { TransactionsPage } from "./pages/TransactionsPage.tsx";
import { BudgetsPage } from "./pages/BudgetsPage.tsx";
import { BillsPage } from "./pages/BillsPage.tsx";
import { ReportsPage } from "./pages/ReportsPage.tsx";
import { ProjectionsPage } from "./pages/ProjectionsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

export function App() {
  return (
    <AuthProvider>
      <PinProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><AccountTypesProvider><AppLayout /></AccountTypesProvider></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="projections/:tab?" element={<ProjectionsPage />} />
            <Route path="accounts/:typeSlug" element={<AccountTypePage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="bills/:tab?" element={<BillsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings/:tab?" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </PinProvider>
    </AuthProvider>
  );
}
