import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, Pencil, Plus, Wallet } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, extractApiError } from '../services/api';
import type { Account, AccountType, SpaceType, Transaction } from '../types/finance';
import { formatDateID, formatIDR, getAccountTypeLabel, getSpaceLabel } from '../utils/finance';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Select,
  StatCard,
  Textarea,
} from '../components/ui/Primitives';

const accountSchema = z.object({
  name: z.string().min(2, 'Nama akun minimal 2 karakter'),
  type: z.enum(['cash', 'bank', 'ewallet', 'savings', 'emergency', 'investment', 'gold']),
  initial_balance: z.coerce.number().min(0, 'Saldo awal tidak boleh negatif'),
  space: z.enum(['pribadi', 'keluarga', 'anak']),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export function AccountsPage() {
  const { dataVersion, triggerRefresh } = usePeriod();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [spaceFilter, setSpaceFilter] = useState<SpaceType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null);
  const [historyTxs, setHistoryTxs] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof accountSchema>, unknown, AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      initial_balance: 0,
      space: 'keluarga',
      description: '',
      is_active: true,
    },
  });

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await accountsApi.list(spaceFilter);
      setAccounts(list);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [spaceFilter]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts, dataVersion]);

  const openCreate = () => {
    setEditing(null);
    reset({
      name: '',
      type: 'bank',
      initial_balance: 0,
      space: 'keluarga',
      description: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    reset({
      name: acc.name,
      type: acc.type,
      initial_balance: acc.initial_balance,
      space: acc.space,
      description: acc.description || '',
      is_active: acc.is_active,
    });
    setModalOpen(true);
  };

  const openHistory = async (acc: Account) => {
    setHistoryAccount(acc);
    setHistoryLoading(true);
    try {
      const txs = await accountsApi.transactions(acc.id);
      setHistoryTxs(txs);
    } catch {
      setHistoryTxs([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const onSubmit = async (values: AccountFormValues) => {
    try {
      if (editing) {
        await accountsApi.update(editing.id, values);
      } else {
        await accountsApi.create(values);
      }
      setModalOpen(false);
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const totalBalance = accounts.filter((a) => a.is_active).reduce((s, a) => s + a.current_balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Akun Keuangan</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola rekening bank, e-wallet, uang tunai, tabungan, dan dana darurat secara terpusat.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/60">
            {(['all', 'keluarga', 'pribadi', 'anak'] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSpaceFilter(sp)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  spaceFilter === sp ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sp === 'all' ? 'Semua' : getSpaceLabel(sp as SpaceType)}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Tambah Akun
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadAccounts} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Saldo Akun Aktif"
          value={formatIDR(totalBalance)}
          subtext={`${accounts.filter((a) => a.is_active).length} akun aktif`}
          tone="positive"
        />
        <StatCard
          label="Akun Ruang Keluarga & Anak"
          value={formatIDR(
            accounts
              .filter((a) => a.is_active && (a.space === 'keluarga' || a.space === 'anak'))
              .reduce((s, a) => s + a.current_balance, 0)
          )}
          subtext="Terbuka untuk anggota keluarga"
        />
        <StatCard
          label="Akun Ruang Pribadi Anda"
          value={formatIDR(
            accounts
              .filter((a) => a.is_active && a.space === 'pribadi')
              .reduce((s, a) => s + a.current_balance, 0)
          )}
          subtext="Terlindungi dari anggota lain"
        />
      </div>

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Memuat daftar akun...</Card>
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet className="w-5 h-5" />}
            title="Belum ada akun keuangan"
            description="Tambahkan rekening bank, e-wallet, atau kas tunai untuk mulai mencatat mutasi saldo."
            actionLabel="Tambah Akun Pertama"
            onAction={openCreate}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <Card key={acc.id} className="p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {getAccountTypeLabel(acc.type as AccountType)} · {getSpaceLabel(acc.space)}
                    </p>
                    <h2 className="text-base font-semibold text-slate-900 mt-1 truncate">{acc.name}</h2>
                  </div>
                  <span
                    className={`text-[11px] font-semibold ${
                      acc.is_active ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {acc.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-4">
                  {formatIDR(acc.current_balance)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Saldo awal: <span className="font-mono tabular-nums">{formatIDR(acc.initial_balance)}</span> · Pemilik:{' '}
                  {acc.owner_name}
                </p>
                {acc.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{acc.description}</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => openHistory(acc)}>
                  <Eye className="w-3.5 h-3.5" />
                  Mutasi
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(acc)}>
                  <Pencil className="w-3.5 h-3.5" />
                  Ubah
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Ubah Akun Keuangan' : 'Tambah Akun Keuangan'}
        description="Saldo aktual akan selalu dihitung dari saldo awal ditambah mutasi transaksi yang valid."
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nama Akun"
            placeholder="Contoh: Bank BCA Keluarga"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Jenis Akun" error={errors.type?.message} {...register('type')}>
              <option value="bank">Rekening Bank</option>
              <option value="cash">Uang Tunai</option>
              <option value="ewallet">E-Wallet</option>
              <option value="savings">Tabungan</option>
              <option value="emergency">Dana Darurat</option>
              <option value="investment">Investasi</option>
              <option value="gold">Emas Digital</option>
            </Select>

            <Select label="Ruang Keuangan" error={errors.space?.message} {...register('space')}>
              <option value="keluarga">Keluarga</option>
              <option value="pribadi">Pribadi</option>
              <option value="anak">Anak</option>
            </Select>
          </div>

          <Input
            label="Saldo Awal (Rp)"
            type="number"
            min={0}
            className="font-mono tabular-nums"
            error={errors.initial_balance?.message}
            {...register('initial_balance')}
          />

          <Textarea
            label="Keterangan (Opsional)"
            rows={2}
            placeholder="Catatan penggunaan rekening ini"
            {...register('description')}
          />

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" className="rounded border-slate-300" {...register('is_active')} />
            <span>Akun berstatus aktif untuk transaksi</span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah Akun'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Account Transaction History Modal */}
      <Modal
        open={Boolean(historyAccount)}
        onClose={() => setHistoryAccount(null)}
        title={`Riwayat Mutasi · ${historyAccount?.name || ''}`}
        description={`Saldo saat ini: ${historyAccount ? formatIDR(historyAccount.current_balance) : ''}`}
        maxWidth="max-w-2xl"
      >
        {historyLoading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Memuat riwayat mutasi...</p>
        ) : historyTxs.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">Belum ada transaksi pada akun ini.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {historyTxs.map((tx) => {
              const isIncoming =
                tx.type === 'income' || (tx.type === 'transfer' && tx.to_account_id === historyAccount?.id);
              return (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {tx.notes || tx.category_name || 'Transfer Antar-Akun'}
                    </p>
                    <p className="text-slate-500">
                      {formatDateID(tx.transaction_date)} · {tx.reference_code} · {tx.recorder_name}
                    </p>
                  </div>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      isIncoming ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {isIncoming ? '+' : '-'}
                    {formatIDR(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
