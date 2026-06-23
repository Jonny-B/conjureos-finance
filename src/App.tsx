// MemoryRouter (in-memory history) instead of HashRouter: ConjureOS runs apps
// in a sandboxed, opaque-origin srcdoc iframe where the History API throws a
// SecurityError (about:srcdoc + null origin). HashRouter touches window.history
// on init and crashes the app at load ("Script error."); MemoryRouter keeps all
// routing state in memory and never touches window.history/location, so it works
// both inside ConjureOS and as a standalone deploy.
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { FinanceProvider } from "./store/FinanceContext";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { Transactions } from "./components/Transactions";
import { ReviewQueue } from "./components/ReviewQueue";
import { Recurring } from "./components/Recurring";
import { Alerts } from "./components/Alerts";
import { Budgets } from "./components/Budgets";
import { Categories } from "./components/Categories";
import { Settings } from "./components/Settings";

export function App() {
  return (
    <FinanceProvider>
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="recurring" element={<Recurring />} />
            <Route path="review" element={<ReviewQueue />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="categories" element={<Categories />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </FinanceProvider>
  );
}
