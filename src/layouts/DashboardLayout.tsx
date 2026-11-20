import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  PiggyBank,
  Plus,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePeriod } from '../hooks/usePeriod';
import { notificationsApi } from '../services/api';
import type { NotificationItem } from '../types/finance';
import { computeProfileCompleteness, formatDateTimeID, getMonthNameID } from '../utils/finance';
import { TransactionModal } from '../components/transactions/TransactionModal';
import { Button } from '../components/ui/Primitives';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transaksi', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Akun Keuangan', icon: Wallet },
  { to: '/budgets', label: 'Anggaran', icon: PieChart },
  { to: '/savings', label: 'Tabungan & Target', icon: PiggyBank },
  { to: '/emergency-fund', label: 'Dana Darurat', icon: ShieldAlert },
  { to: '/investments', label: 'Investasi', icon: TrendingUp },
  { to: '/bills', label: 'Tagihan & Cicilan', icon: CreditCard },
  { to: '/reports', label: 'Laporan', icon: BarChart3 },
  { to: '/family', label: 'Anggota Keluarga', icon: Users },
  { to: '/settings', label: 'Pengaturan', icon: Settings },
];

export function DashboardLayout() {
  const { user, families, logout } = useAuth();
  const { filters, availableYears, setMonth, setYear, stepYear, triggerRefresh } = usePeriod();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickTxOpen, setQuickTxOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    notificationsApi.list().then(setNotifications).catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const completeness = computeProfileCompleteness(user, families[0] ?? null);

  const currentNav = NAV_ITEMS.find((item) => item.to === location.pathname) ?? NAV_ITEMS[0];

  const handleMarkRead = async (id: number) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-display font-bold text-sm">
            FF
          </div>
          <span className="font-display font-semibold text-white tracking-tight text-base whitespace-nowrap">
            Family Finance
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Tutup navigasi"
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600/15 text-emerald-400'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2">
        <div className="flex items-center gap-3 mb-3">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center text-xs font-semibold shrink-0">
              {user?.name?.slice(0, 2).toUpperCase() || 'FF'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{user?.name || 'Pengguna Utama'}</p>
            <p className="text-[11px] text-slate-400 truncate">
              {user?.occupation || families[0]?.name || user?.email}
            </p>
          </div>
        </div>
        <NavLink
          to="/settings"
          onClick={() => setMobileMenuOpen(false)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              {completeness.percentage < 100 ? 'Lengkapi Profil' : 'Profil Lengkap'}
            </span>
          </span>
          <span className="font-mono tabular-nums text-[11px] text-emerald-400 shrink-0">
            {completeness.percentage}%
          </span>
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-red-500/15 hover:text-red-300 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-800 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] h-full z-10">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Menu className="w-4 h-4" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 whitespace-nowrap">Family Finance</span>
              <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">{currentNav.label}</span>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Period Picker */}
            <div className="hidden md:flex items-center gap-1.5">
              <select
                aria-label="Pilih Bulan"
                value={filters.month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="h-9 px-2.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                {Array.from({ length: 12 }, (_, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {getMonthNameID(idx + 1)}
                  </option>
                ))}
              </select>
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => stepYear(-1)}
                  aria-label="Tahun sebelumnya"
                  className="h-9 w-7 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 border-r border-slate-200 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <select
                  aria-label="Pilih Tahun"
                  value={filters.year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="h-9 px-2.5 text-xs font-medium bg-white text-slate-700 font-mono tabular-nums focus:outline-none cursor-pointer"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => stepYear(1)}
                  aria-label="Tahun berikutnya"
                  className="h-9 w-7 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 border-l border-slate-200 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
                className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">Notifikasi Keuangan</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Tutup notifikasi"
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 text-center">Belum ada notifikasi.</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 text-xs ${n.is_read ? 'bg-white' : 'bg-slate-50'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900">{n.title}</p>
                            {!n.is_read && (
                              <button
                                type="button"
                                onClick={() => handleMarkRead(n.id)}
                                className="text-[11px] font-medium text-emerald-700 hover:underline shrink-0 cursor-pointer"
                              >
                                Tandai dibaca
                              </button>
                            )}
                          </div>
                          <p className="text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                          <p className="text-[11px] text-slate-400 mt-1.5">{formatDateTimeID(n.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <NavLink
              to="/settings"
              aria-label={`Profil pengguna: ${user?.name || 'Akun'}`}
              className="hidden sm:flex items-center gap-2 h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-md object-cover shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-md bg-slate-900 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                  {user?.name?.slice(0, 2).toUpperCase() || 'FF'}
                </span>
              )}
              <span className="hidden xl:inline text-xs font-medium text-slate-700 max-w-[130px] truncate">
                {user?.name}
              </span>
            </NavLink>

            {/* Quick Add Transaction */}
            <Button size="sm" onClick={() => setQuickTxOpen(true)} className="h-9 px-3.5">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Catat Transaksi</span>
              <span className="sm:hidden">Catat</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <TransactionModal
        open={quickTxOpen}
        onClose={() => setQuickTxOpen(false)}
        onSuccess={triggerRefresh}
      />
    </div>
  );
}
