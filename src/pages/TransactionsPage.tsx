import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Download,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, categoriesApi, extractApiError, transactionsApi } from '../services/api';
import type { Account, Category, PaginationMeta, Transaction } from '../types/finance';
import {
  formatDateID,
  formatDateTimeID,
  formatIDR,
  getSpaceLabel,
  getTransactionTypeLabel,
} from '../utils/finance';
import { TransactionModal } from '../components/transactions/TransactionModal';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  TableSkeleton,
} from '../components/ui/Primitives';

export function TransactionsPage() {
  const { families } = useAuth();
  const { dataVersion, triggerRefresh } = usePeriod();

  const [items, setItems] = useState<Transaction[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const members = families[0]?.members ?? [];

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, accs, cats] = await Promise.all([
        transactionsApi.list({
          page,
          per_page: 12,
          search: search || undefined,
          type: typeFilter,
          account_id: accountFilter,
          category_id: categoryFilter,
          member_id: memberFilter,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
        accountsApi.list('all'),
        categoriesApi.list(),
      ]);
      setItems(res.items);
      setMeta(res.meta);
      setAccounts(accs);
      setCategories(cats);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, accountFilter, categoryFilter, memberFilter, startDate, endDate]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions, dataVersion]);

  const handleDeleteConfirm = async () => {
    if (!deletingTx) return;
    try {
      await transactionsApi.remove(deletingTx.id);
      setDeletingTx(null);
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const url = transactionsApi.getExportUrl(format, {
      type: typeFilter,
      search: search || undefined,
    });
    const link = document.createElement('a');
    link.href = url;
    link.download = format === 'excel' ? 'transaksi.xls' : 'transaksi.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Buku Kas & Transaksi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Catatan seluruh pemasukan, pengeluaran, dan transfer antar-akun dengan proteksi idempotency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingTx(null);
              setModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Tambah Transaksi
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              aria-label="Cari transaksi"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari catatan, kode TRX, akun, kategori..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>

          <select
            aria-label="Filter jenis transaksi"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">Semua Jenis</option>
            <option value="income">Pemasukan</option>
            <option value="expense">Pengeluaran</option>
            <option value="transfer">Transfer Antar-Akun</option>
          </select>

          <select
            aria-label="Filter kategori"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter akun"
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">Semua Akun</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter anggota"
            value={memberFilter}
            onChange={(e) => {
              setMemberFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">Semua Anggota</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <label htmlFor="start-date" className="text-slate-500">
              Dari:
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="h-8 px-2 border border-slate-200 rounded-md text-slate-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="end-date" className="text-slate-500">
              Sampai:
            </label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="h-8 px-2 border border-slate-200 rounded-md text-slate-700"
            />
          </div>
          {(search || typeFilter !== 'all' || accountFilter !== 'all' || categoryFilter !== 'all' || memberFilter !== 'all' || startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setAccountFilter('all');
                setCategoryFilter('all');
                setMemberFilter('all');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="text-emerald-700 font-medium hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>
      </Card>

      {error && <ErrorBanner message={error} onRetry={loadTransactions} />}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight className="w-5 h-5" />}
            title="Tidak ada transaksi ditemukan"
            description="Ubah filter pencarian Anda atau tambahkan catatan transaksi baru."
            actionLabel="Catat Transaksi Baru"
            onAction={() => {
              setEditingTx(null);
              setModalOpen(true);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Tanggal & Kode</th>
                  <th className="py-3 px-4">Keterangan & Kategori</th>
                  <th className="py-3 px-4">Akun</th>
                  <th className="py-3 px-4">Ruang & Pencatat</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {items.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="text-xs font-medium text-slate-900">{formatDateID(tx.transaction_date)}</p>
                        <p className="text-[11px] font-mono text-slate-400">{tx.reference_code}</p>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {tx.notes || tx.category_name || 'Transfer Antar-Akun'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {getTransactionTypeLabel(tx.type)} · {tx.category_name || 'Transfer'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {tx.account_name}
                        {tx.to_account_name ? ` → ${tx.to_account_name}` : ''}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {getSpaceLabel(tx.space)} · {tx.recorder_name}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                          isIncome ? 'text-emerald-700' : isTransfer ? 'text-slate-700' : 'text-red-600'
                        }`}
                      >
                        {isIncome ? '+' : isTransfer ? '' : '-'}
                        {formatIDR(tx.amount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailTx(tx)}
                            aria-label={`Detail transaksi ${tx.reference_code}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTx(tx);
                              setModalOpen(true);
                            }}
                            aria-label={`Edit transaksi ${tx.reference_code}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTx(tx)}
                            aria-label={`Hapus transaksi ${tx.reference_code}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Menampilkan halaman {meta.current_page} dari {meta.last_page} ({meta.total} transaksi)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.current_page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={meta.current_page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={triggerRefresh}
        editingTransaction={editingTx}
      />

      {/* Detail Modal */}
      <Modal
        open={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
        title={`Detail Transaksi ${detailTx?.reference_code || ''}`}
      >
        {detailTx && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Jenis</p>
                <p className="font-semibold text-slate-900 mt-0.5">{getTransactionTypeLabel(detailTx.type)}</p>
              </div>
              <div>
                <p className="text-slate-500">Nominal</p>
                <p className="font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatIDR(detailTx.amount)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tanggal</p>
                <p className="font-medium text-slate-900 mt-0.5">{formatDateID(detailTx.transaction_date)}</p>
              </div>
              <div>
                <p className="text-slate-500">Ruang Keuangan</p>
                <p className="font-medium text-slate-900 mt-0.5">{getSpaceLabel(detailTx.space)}</p>
              </div>
              <div>
                <p className="text-slate-500">Akun Asal</p>
                <p className="font-medium text-slate-900 mt-0.5">{detailTx.account_name}</p>
              </div>
              <div>
                <p className="text-slate-500">{detailTx.to_account_name ? 'Akun Tujuan' : 'Kategori'}</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {detailTx.to_account_name || detailTx.category_name || '-'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Dicatat Oleh</p>
                <p className="font-medium text-slate-900 mt-0.5">{detailTx.recorder_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Diperbarui</p>
                <p className="font-medium text-slate-900 mt-0.5">{formatDateTimeID(detailTx.updated_at)}</p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">Catatan</p>
              <p className="text-xs text-slate-800 mt-1">{detailTx.notes || 'Tidak ada catatan.'}</p>
            </div>
            {detailTx.attachment && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">Lampiran Bukti Transaksi</p>
                <a
                  href={detailTx.attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  Unduh / Lihat {detailTx.attachment.file_name}
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deletingTx)}
        onClose={() => setDeletingTx(null)}
        title="Hapus Transaksi?"
        description="Saldo akun terkait akan otomatis dikembalikan setelah penghapusan."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Apakah Anda yakin ingin menghapus transaksi{' '}
            <span className="font-semibold text-slate-900">{deletingTx?.reference_code}</span> sebesar{' '}
            <span className="font-semibold font-mono text-slate-900">
              {deletingTx ? formatIDR(deletingTx.amount) : ''}
            </span>
            ?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingTx(null)}>
              Batal
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>
              Ya, Hapus Transaksi
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
