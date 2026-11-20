import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ArrowUpRight, ArrowDownRight, ArrowLeftRight, ChevronLeft, ChevronRight, UserCheck, Wallet } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, dashboardApi, extractApiError } from '../services/api';
import type {
  Account,
  CashFlowPoint,
  DashboardSummary,
  ExpenseCategoryPoint,
  SpaceType,
} from '../types/finance';
import {
  computeProfileCompleteness,
  formatDateID,
  formatIDR,
  formatIDRCompact,
  getMonthNameID,
  getSpaceLabel,
} from '../utils/finance';
import { TransactionModal } from '../components/transactions/TransactionModal';
import { Card, EmptyState, ErrorBanner, StatCard } from '../components/ui/Primitives';

export function DashboardPage() {
  const { user, families } = useAuth();
  const {
    filters,
    availableYears,
    setMonth,
    setYear,
    stepYear,
    setSpace,
    setMemberId,
    setAccountId,
    dataVersion,
    triggerRefresh,
  } = usePeriod();
  const completeness = computeProfileCompleteness(user, families[0] ?? null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowPoint[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryPoint[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const members = families[0]?.members ?? [];

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, cfData, catData, accList] = await Promise.all([
        dashboardApi.summary(filters),
        dashboardApi.cashFlow({ ...filters, months: 6 }),
        dashboardApi.expenseCategories(filters),
        accountsApi.list('all'),
      ]);
      setSummary(sumData);
      setCashFlow(cfData);
      setCategories(catData);
      setAccounts(accList);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, dataVersion]);

  const hasTransactions = (summary?.recent_transactions?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header & Multi-dimensional Filter Bar */}
      <div className="space-y-4">
        <div className="flex flex-col 2xl:flex-row 2xl:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Ringkasan Keuangan · {getMonthNameID(filters.month)} {filters.year}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Pantau arus kas, anggaran kategori, target tabungan, dan kekayaan bersih keluarga.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* Segmented Space Filter */}
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200/60 overflow-x-auto">
              {(['all', 'keluarga', 'pribadi', 'anak'] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setSpace(sp)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    filters.space === sp
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sp === 'all' ? 'Semua Ruang' : getSpaceLabel(sp as SpaceType)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              <select
                aria-label="Filter anggota keluarga"
                value={filters.member_id ?? 'all'}
                onChange={(e) =>
                  setMemberId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="h-9 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="all">Semua Anggota</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter akun keuangan"
                value={filters.account_id ?? 'all'}
                onChange={(e) =>
                  setAccountId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="h-9 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="all">Semua Akun</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter bulan dashboard"
                value={filters.month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="md:hidden h-9 px-2.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                {Array.from({ length: 12 }, (_, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {getMonthNameID(idx + 1)}
                  </option>
                ))}
              </select>
              <div className="md:hidden inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => stepYear(-1)}
                  aria-label="Tahun dashboard sebelumnya"
                  className="h-9 w-7 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 border-r border-slate-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <select
                  aria-label="Filter tahun dashboard"
                  value={filters.year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="h-9 flex-1 min-w-0 px-2 text-xs font-medium bg-white text-slate-700 font-mono tabular-nums focus:outline-none"
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
                  aria-label="Tahun dashboard berikutnya"
                  className="h-9 w-7 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 border-l border-slate-200"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadDashboard} />}

      {completeness.percentage < 100 && (
        <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Lengkapi Data Diri & Profil Keluarga
                </h2>
                <span className="text-xs font-semibold font-mono tabular-nums text-emerald-700">
                  {completeness.filled} dari {completeness.total} data terisi ({completeness.percentage}%)
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${completeness.percentage}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 truncate">
                Belum dilengkapi: {completeness.missingLabels.slice(0, 4).join(', ')}
                {completeness.missingLabels.length > 4
                  ? `, dan ${completeness.missingLabels.length - 4} lainnya`
                  : ''}
              </p>
            </div>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shrink-0"
          >
            Lengkapi Sekarang
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Card>
      )}

      {/* 8 KPI Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Saldo Seluruh Akun"
          value={loading || !summary ? '—' : formatIDR(summary.total_balance)}
          subtext={`${accounts.filter((a) => a.is_active).length} akun aktif terpantau`}
        />
        <StatCard
          label="Pemasukan Bulan Ini"
          value={loading || !summary ? '—' : formatIDR(summary.monthly_income)}
          subtext="Tidak termasuk transfer antar-akun"
          tone="positive"
        />
        <StatCard
          label="Pengeluaran Bulan Ini"
          value={loading || !summary ? '—' : formatIDR(summary.monthly_expense)}
          subtext="Konsumsi & tagihan operasional"
          tone="negative"
        />
        <StatCard
          label="Sisa Uang Bulan Ini"
          value={loading || !summary ? '—' : formatIDR(summary.monthly_net)}
          subtext="Surplus / defisit arus kas bulanan"
          tone={summary && summary.monthly_net >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Total Tabungan Target"
          value={loading || !summary ? '—' : formatIDR(summary.total_savings)}
          subtext={`${summary?.savings_goals.length ?? 0} target tabungan aktif`}
        />
        <StatCard
          label="Total Dana Darurat"
          value={loading || !summary ? '—' : formatIDR(summary.total_emergency_fund)}
          subtext={
            summary?.emergency_fund
              ? `${summary.emergency_fund.progress_percentage}% dari target`
              : 'Belum ada dana darurat'
          }
          tone="positive"
        />
        <StatCard
          label="Total Nilai Investasi"
          value={loading || !summary ? '—' : formatIDR(summary.total_investment_value)}
          subtext="Emas digital, reksa dana & saham"
        />
        <StatCard
          label="Total Aset Bersih"
          value={loading || !summary ? '—' : formatIDR(summary.total_net_worth)}
          subtext="Saldo akun + portofolio investasi"
          tone="positive"
        />
      </div>

      {/* Charts Row: Income vs Expense Bar + Cash Flow Trend Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Pemasukan vs Pengeluaran (6 Bulan)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Perbandingan arus masuk dan keluar riil setiap bulan
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => formatIDRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip
                  formatter={(value) => formatIDR(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="income" name="Pemasukan" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Pengeluaran" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Arus Kas Bersih (Net Cash Flow)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Surplus bulanan yang tersedia untuk tabungan dan investasi
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netCashFlowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => formatIDRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip
                  formatter={(value) => formatIDR(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Arus Kas Bersih"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#netCashFlowGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Category Breakdown & Budget Utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 p-6">
          <h2 className="text-sm font-semibold text-slate-900">Pengeluaran per Kategori</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Distribusi pengeluaran konsumtif bulan berjalan
          </p>

          {categories.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-5 h-5" />}
              title="Belum ada pengeluaran"
              description="Pengeluaran berdasarkan kategori akan muncul di sini setelah transaksi dicatat."
            />
          ) : (
            <div className="space-y-4">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="total"
                      nameKey="category_name"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {categories.map((entry) => (
                        <Cell key={entry.category_id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatIDR(Number(v ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="divide-y divide-slate-100">
                {categories.slice(0, 5).map((cat) => (
                  <div key={cat.category_id} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-slate-700 font-medium truncate">{cat.category_name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="text-slate-500">{cat.percentage}%</span>
                      <span className="font-semibold text-slate-900">{formatIDR(cat.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-7 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Ringkasan Anggaran</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Perbandingan batas anggaran dengan realisasi aktual
              </p>
            </div>
            <Link
              to="/budgets"
              className="text-xs font-medium text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              Kelola Anggaran <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {!summary || summary.budgets.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-5 h-5" />}
              title="Belum ada anggaran"
              description="Atur batas pengeluaran bulanan agar kondisi kas keluarga tetap terkendali."
            />
          ) : (
            <div className="space-y-4">
              {summary.budgets.slice(0, 5).map((b) => {
                const barWidth = Math.min(100, b.usage_percentage);
                const barColor =
                  b.status === 'exceeded'
                    ? 'bg-red-600'
                    : b.status === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-600';
                const statusLabel =
                  b.status === 'exceeded'
                    ? 'Melebihi batas'
                    : b.status === 'warning'
                    ? 'Mendekati batas'
                    : 'Aman';
                const statusColor =
                  b.status === 'exceeded'
                    ? 'text-red-600'
                    : b.status === 'warning'
                    ? 'text-amber-700'
                    : 'text-emerald-700';

                return (
                  <div key={b.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-900 truncate">{b.category_name}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{getSpaceLabel(b.space)}</span>
                        <span className="text-slate-400">·</span>
                        <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                      </div>
                      <span className="font-mono tabular-nums text-slate-700 shrink-0">
                        {formatIDR(b.spent_amount)} / {formatIDR(b.amount_limit)} ({b.usage_percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row: Recent Transactions, Upcoming Bills, Savings & Emergency Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Transaksi Terbaru</h2>
              <p className="text-xs text-slate-500 mt-0.5">Aktivitas kas terbaru pada periode terpilih</p>
            </div>
            <Link
              to="/transactions"
              className="text-xs font-medium text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              Lihat Semua <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {!hasTransactions ? (
            <EmptyState
              icon={<ArrowLeftRight className="w-5 h-5" />}
              title="Belum ada transaksi di periode ini"
              description="Catat pemasukan, pengeluaran, atau transfer antar-akun pertama Anda untuk melihat riwayat."
              actionLabel="Catat Transaksi Pertama"
              onAction={() => setAddModalOpen(true)}
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {summary!.recent_transactions.map((tx) => {
                const isIncome = tx.type === 'income';
                const isTransfer = tx.type === 'transfer';
                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isIncome
                            ? 'bg-emerald-50 text-emerald-700'
                            : isTransfer
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : isTransfer ? (
                          <ArrowLeftRight className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {tx.notes || tx.category_name || 'Transfer Antar-Akun'}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {formatDateID(tx.transaction_date)} · {tx.account_name}
                          {tx.to_account_name ? ` → ${tx.to_account_name}` : ''} · {getSpaceLabel(tx.space)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${
                        isIncome
                          ? 'text-emerald-700'
                          : isTransfer
                          ? 'text-slate-700'
                          : 'text-red-600'
                      }`}
                    >
                      {isIncome ? '+' : isTransfer ? '' : '-'}
                      {formatIDR(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="lg:col-span-5 space-y-6">
          {/* Upcoming Bills */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Tagihan Mendatang</h2>
              <Link to="/bills" className="text-xs font-medium text-emerald-700 hover:underline">
                Kelola
              </Link>
            </div>
            {!summary || summary.upcoming_bills.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Semua tagihan bulan ini telah lunas.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.upcoming_bills.map((bill) => (
                  <div key={bill.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{bill.name}</p>
                      <p className="text-[11px] text-slate-500">
                        Jatuh tempo {formatDateID(bill.due_date)} ·{' '}
                        <span className={bill.status === 'overdue' ? 'text-red-600 font-semibold' : ''}>
                          {bill.status === 'overdue' ? 'Terlambat' : 'Belum dibayar'}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs font-semibold font-mono tabular-nums text-slate-900 shrink-0">
                      {formatIDR(bill.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Savings & Emergency Fund Progress */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Tabungan & Dana Darurat</h2>
              <Link to="/savings" className="text-xs font-medium text-emerald-700 hover:underline">
                Detail
              </Link>
            </div>

            {summary?.emergency_fund && (
              <div className="space-y-1.5 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">{summary.emergency_fund.name}</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                    {summary.emergency_fund.progress_percentage}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${summary.emergency_fund.progress_percentage}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Terkumpul {formatIDR(summary.emergency_fund.current_amount)} dari{' '}
                  {formatIDR(summary.emergency_fund.target_amount)}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {summary?.savings_goals.slice(0, 3).map((goal) => (
                <div key={goal.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate">{goal.name}</span>
                    <span className="font-mono tabular-nums text-slate-600 shrink-0">
                      {goal.progress_percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full"
                      style={{ width: `${goal.progress_percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <TransactionModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={triggerRefresh}
      />
    </div>
  );
}
