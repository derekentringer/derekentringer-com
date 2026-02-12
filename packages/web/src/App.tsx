import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { PortfolioPage } from "./pages/PortfolioPage.tsx";
import { PrivacyPage } from "./pages/PrivacyPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { trackPageview } from "./utils/analytics.ts";

export function App() {
  const location = useLocation();

  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<PortfolioPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
