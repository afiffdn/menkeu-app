import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { extractApiError, reportsApi, transactionsApi } from '../services/api';
import type {
  CashFlowPoint,
  DashboardSummary,
  ExpenseCategoryPoint,
  MultiYearPoint,
  Transaction,
} from '../types/finance';
import { formatDateID, formatIDR, formatIDRCompact, getMonthNameID } from '../utils/finance';
import { Button, Card, ErrorBanner, StatCard } from '../components/ui/Primitives';

type ReportTab = 'monthly' | 'yearly' | 'multiyear' | 'cashflow' | 'expenses' | 'income';

export function ReportsPage() {
  const { filters, availableYears, dataVersion } = usePeriod();
  const [tab, setTab] = useState<ReportTab>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [multiStartYear, setMultiStartYear] = useState<number>(() => new Date().getFullYear() - 4);
  const [multiEndYear, setMultiEndYear] = useState<number>(() => new Date().getFullYear());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthlyData, setMonthlyData] = useState<{
    summary: DashboardSummary;
    expense_categories: ExpenseCategoryPoint[];
    transactions: Transaction[];
  } | null>(null);
  const [yearlyData, setYearlyData] = useState<{
    year: number;
    total_income: number;
    total_expense: number;
    net_savings: number;
    months: Array<{ month: number; year: number; income: number; expense: number; net: number }>;
  } | null>(null);
  const [multiYearData, setMultiYearData] = useState<{
    start_year: number;
    end_year: number;
    series: MultiYearPoint[];
  } | null>(null);
  const [cashFlowData, setCashFlowData] = useState<CashFlowPoint[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, yRes, myRes, cfRes] = await Promise.all([
        reportsApi.monthly(filters),
        reportsApi.yearly({ year: filters.year, space: filters.space }),
        reportsApi.multiYear({
          start_year: Math.min(multiStartYear, multiEndYear),
          end_year: Math.max(multiStartYear, multiEndYear),
          space: filters.space,
        }),
        reportsApi.cashFlow({ ...filters, months: 12 }),
      ]);
      setMonthlyData(mRes);
      setYearlyData(yRes);
      setMultiYearData(myRes);
      setCashFlowData(cfRes);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filters, multiStartYear, multiEndYear]);

  useEffect(() => {
    loadReports();
  }, [loadReports, dataVersion]);

  const handleExport = (format: 'csv' | 'excel') => {
    const url = transactionsApi.getExportUrl(format, {
      month: tab === 'yearly' || tab === 'multiyear' ? undefined : filters.month,
      year: tab === 'multiyear' ? undefined : filters.year,
      space: filters.space,
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-family-finance.${format === 'excel' ? 'xls' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const filteredReportTxs = (monthlyData?.transactions ?? []).filter((t) => {
    if (tab === 'expenses' && (t.type !== 'expense' || t.is_asset_allocation)) return false;
    if (tab === 'income' && (t.type !== 'income' || t.is_asset_allocation)) return false;
    if (startDate && t.transaction_date < startDate) return false;
    if (endDate && t.transaction_date > endDate) return false;
    return true;
  });

  const multiYearSeries = multiYearData?.series ?? [];
  const multiYearTotals = useMemo(() => {
    const totalIncome = multiYearSeries.reduce((s, p) => s + p.income, 0);
    const totalExpense = multiYearSeries.reduce((s, p) => s + p.expense, 0);
    const net = totalIncome - totalExpense;
    const avgSavingsRate =
      totalIncome > 0 ? Math.round((net / totalIncome) * 1000) / 10 : 0;
    return { totalIncome, totalExpense, net, avgSavingsRate };
  }, [multiYearSeries]);

  const effectiveStartYear = multiYearData?.start_year ?? Math.min(multiStartYear, multiEndYear);
  const effectiveEndYear = multiYearData?.end_year ?? Math.max(multiStartYear, multiEndYear);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {tab === 'multiyear'
              ? `Laporan Multi-Tahun · ${effectiveStartYear}–${effectiveEndYear}`
              : `Laporan Keuangan · ${getMonthNameID(filters.month)} ${filters.year}`}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Transfer antar-akun, tabungan, dan investasi tidak dihitung sebagai pengeluaran konsumtif.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" />
            Cetak / PDF
          </Button>
        </div>
      </div>

      {/* Report Tabs & Date / Year Range */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-lg border border-slate-200/60">
          {[
            { id: 'monthly', label: 'Bulanan' },
            { id: 'yearly', label: 'Tahunan' },
            { id: 'multiyear', label: 'Multi-Tahun' },
            { id: 'cashflow', label: 'Arus Kas' },
            { id: 'expenses', label: 'Pengeluaran' },
            { id: 'income', label: 'Pemasukan' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as ReportTab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'multiyear' ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Rentang tahun:</span>
            <select
              aria-label="Tahun awal perbandingan"
              value={multiStartYear}
              onChange={(e) => setMultiStartYear(Number(e.target.value))}
              className="h-8 px-2 bg-white border border-slate-200 rounded-md font-mono tabular-nums text-slate-700"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="text-slate-400">–</span>
            <select
              aria-label="Tahun akhir perbandingan"
              value={multiEndYear}
              onChange={(e) => setMultiEndYear(Number(e.target.value))}
              className="h-8 px-2 bg-white border border-slate-200 rounded-md font-mono tabular-nums text-slate-700"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Rentang khusus:</span>
            <input
              type="date"
              aria-label="Tanggal mulai laporan"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 px-2 bg-white border border-slate-200 rounded-md"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              aria-label="Tanggal akhir laporan"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 px-2 bg-white border border-slate-200 rounded-md"
            />
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadReports} />}

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Menghitung laporan keuangan...</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard
              label={
                tab === 'multiyear'
                  ? `Pemasukan ${effectiveStartYear}–${effectiveEndYear}`
                  : tab === 'yearly'
                  ? `Pemasukan ${filters.year}`
                  : 'Pemasukan Periode'
              }
              value={formatIDR(
                tab === 'multiyear'
                  ? multiYearTotals.totalIncome
                  : tab === 'yearly'
                  ? yearlyData?.total_income ?? 0
                  : monthlyData?.summary.monthly_income ?? 0
              )}
              tone="positive"
            />
            <StatCard
              label={
                tab === 'multiyear'
                  ? `Pengeluaran ${effectiveStartYear}–${effectiveEndYear}`
                  : tab === 'yearly'
                  ? `Pengeluaran ${filters.year}`
                  : 'Pengeluaran Periode'
              }
              value={formatIDR(
                tab === 'multiyear'
                  ? multiYearTotals.totalExpense
                  : tab === 'yearly'
                  ? yearlyData?.total_expense ?? 0
                  : monthlyData?.summary.monthly_expense ?? 0
              )}
              tone="negative"
            />
            <StatCard
              label={tab === 'multiyear' ? 'Akumulasi Surplus Bersih' : 'Surplus / Arus Kas Bersih'}
              value={formatIDR(
                tab === 'multiyear'
                  ? multiYearTotals.net
                  : tab === 'yearly'
                  ? yearlyData?.net_savings ?? 0
                  : monthlyData?.summary.monthly_net ?? 0
              )}
              tone={
                (tab === 'multiyear'
                  ? multiYearTotals.net
                  : tab === 'yearly'
                  ? yearlyData?.net_savings ?? 0
                  : monthlyData?.summary.monthly_net ?? 0) >= 0
                  ? 'positive'
                  : 'negative'
              }
            />
            <StatCard
              label={tab === 'multiyear' ? 'Rasio Tabungan Agregat' : 'Total Aset Bersih Keluarga'}
              value={
                tab === 'multiyear'
                  ? `${multiYearTotals.avgSavingsRate}%`
                  : formatIDR(monthlyData?.summary.total_net_worth ?? 0)
              }
              subtext={tab === 'multiyear' ? 'Surplus ÷ total pemasukan' : undefined}
              tone={tab === 'multiyear' ? 'positive' : 'neutral'}
            />
          </div>

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              {tab === 'multiyear'
                ? `Perbandingan Kinerja Keuangan (${effectiveStartYear}–${effectiveEndYear})`
                : tab === 'yearly'
                ? `Grafik Keuangan Tahun ${filters.year}`
                : 'Grafik Arus Kas 12 Bulan Terakhir'}
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    tab === 'multiyear'
                      ? multiYearSeries.map((item) => ({
                          label: String(item.year),
                          income: item.income,
                          expense: item.expense,
                        }))
                      : tab === 'yearly'
                      ? (yearlyData?.months ?? []).map((m) => ({
                          label: getMonthNameID(m.month).slice(0, 3),
                          income: m.income,
                          expense: m.expense,
                        }))
                      : cashFlowData
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => formatIDRCompact(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={68}
                  />
                  <Tooltip formatter={(v) => formatIDR(Number(v ?? 0))} />
                  <Bar dataKey="income" name="Pemasukan" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Pengeluaran" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Detail Table */}
          {tab === 'multiyear' ? (
            <Card className="overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">
                  Ringkasan Tahunan (Year-over-Year)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Tahun</th>
                      <th className="py-3 px-4 text-right">Pemasukan</th>
                      <th className="py-3 px-4 text-right">Pengeluaran</th>
                      <th className="py-3 px-4 text-right">Arus Kas Bersih</th>
                      <th className="py-3 px-4 text-right">Rasio Tabungan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {multiYearSeries.map((row) => (
                      <tr key={row.year}>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900">
                          {row.year}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                          {formatIDR(row.income)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-600 font-medium">
                          {formatIDR(row.expense)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            row.net >= 0 ? 'text-slate-900' : 'text-red-600'
                          }`}
                        >
                          {formatIDR(row.net)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {row.savings_rate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Rincian Transaksi Laporan</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Kategori & Catatan</th>
                      <th className="py-3 px-4">Akun</th>
                      <th className="py-3 px-4 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredReportTxs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          Tidak ada transaksi pada filter laporan ini.
                        </td>
                      </tr>
                    ) : (
                      filteredReportTxs.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                            {formatDateID(tx.transaction_date)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-900">
                              {tx.category_name || 'Transfer'}
                            </span>
                            {tx.notes && <span className="text-slate-500"> · {tx.notes}</span>}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{tx.account_name}</td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              tx.type === 'income'
                                ? 'text-emerald-700'
                                : tx.type === 'transfer'
                                ? 'text-slate-600'
                                : 'text-red-600'
                            }`}
                          >
                            {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-'}
                            {formatIDR(tx.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
