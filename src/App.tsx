import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { PeriodProvider } from './hooks/usePeriod';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AccountsPage } from './pages/AccountsPage';
import { BillsPage } from './pages/BillsPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmergencyFundPage } from './pages/EmergencyFundPage';
import { FamilyPage } from './pages/FamilyPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SavingsPage } from './pages/SavingsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Memuat ruang kerja Family Finance...
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <PeriodProvider>
        <BrowserRouter>
          <WorkspaceGate>
            <Routes>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/register" element={<Navigate to="/" replace />} />

              <Route element={<DashboardLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/budgets" element={<BudgetsPage />} />
                <Route path="/savings" element={<SavingsPage />} />
                <Route path="/emergency-fund" element={<EmergencyFundPage />} />
                <Route path="/investments" element={<InvestmentsPage />} />
                <Route path="/bills" element={<BillsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/family" element={<FamilyPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </WorkspaceGate>
        </BrowserRouter>
      </PeriodProvider>
    </AuthProvider>
  );
}
