import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { FinanceProvider } from "./store/FinanceContext";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { Transactions } from "./components/Transactions";
import { ReviewQueue } from "./components/ReviewQueue";
import { Budgets } from "./components/Budgets";
import { Categories } from "./components/Categories";
import { Settings } from "./components/Settings";

export function App() {
  return (
    <FinanceProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="review" element={<ReviewQueue />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="categories" element={<Categories />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </FinanceProvider>
  );
}
