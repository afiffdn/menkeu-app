import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, emergencyFundApi, extractApiError } from '../services/api';
import type { Account, EmergencyFund } from '../types/finance';
import { formatDateID, formatIDR, formatIDRCompact, getTodayISO } from '../utils/finance';
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, Select, StatCard } from '../components/ui/Primitives';

const txSchema = z.object({
  type: z.enum(['deposit', 'withdrawal']),
  account_id: z.coerce.number().min(1, 'Pilih akun sumber/tujuan'),
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  transaction_date: z.string().min(1, 'Tanggal wajib diisi'),
  notes: z.string().optional(),
});

const targetSchema = z.object({
  name: z.string().min(2),
  target_amount: z.coerce.number().positive(),
});

export function EmergencyFundPage() {
  const { dataVersion, triggerRefresh } = usePeriod();
  const [funds, setFunds] = useState<EmergencyFund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [txModalType, setTxModalType] = useState<'deposit' | 'withdrawal' | null>(null);
  const [editTargetOpen, setEditTargetOpen] = useState(false);

  const txForm = useForm<z.input<typeof txSchema>, unknown, z.output<typeof txSchema>>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      type: 'deposit',
      account_id: 1,
      amount: 1000000,
      transaction_date: getTodayISO(),
      notes: '',
    },
  });

  const targetForm = useForm<z.input<typeof targetSchema>, unknown, z.output<typeof targetSchema>>({
    resolver: zodResolver(targetSchema),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fundList, accs] = await Promise.all([emergencyFundApi.list(), accountsApi.list('all')]);
      setFunds(fundList);
      setAccounts(accs.filter((a) => a.is_active));
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  const primaryFund = funds[0] ?? null;

  const openTxModal = (type: 'deposit' | 'withdrawal') => {
    setTxModalType(type);
    txForm.reset({
      type,
      account_id: accounts[0]?.id ?? 1,
      amount: 1000000,
      transaction_date: getTodayISO(),
      notes: '',
    });
  };

  const handleTransact = async (values: z.infer<typeof txSchema>) => {
    if (!primaryFund) return;
    try {
      await emergencyFundApi.transact(primaryFund.id, values);
      setTxModalType(null);
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleUpdateTarget = async (values: z.infer<typeof targetSchema>) => {
    try {
      if (primaryFund) {
        await emergencyFundApi.update(primaryFund.id, values);
      } else {
        await emergencyFundApi.create({
          ...values,
          space: 'keluarga',
          account_ids: accounts.filter((a) => a.type === 'emergency').map((a) => a.id),
        });
      }
      setEditTargetOpen(false);
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Dana Darurat</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Setoran dana darurat dicatat sebagai perpindahan aset, bukan pengeluaran konsumtif.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              targetForm.reset({
                name: primaryFund?.name || 'Dana Darurat Keluarga',
                target_amount: primaryFund?.target_amount || 60000000,
              });
              setEditTargetOpen(true);
            }}
          >
            Atur Target
          </Button>
          {primaryFund && (
            <>
              <Button variant="outline" size="sm" onClick={() => openTxModal('withdrawal')}>
                <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />
                Tarik Dana
              </Button>
              <Button size="sm" onClick={() => openTxModal('deposit')}>
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Tambah Dana
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Memuat data dana darurat...</Card>
      ) : !primaryFund ? (
        <Card>
          <EmptyState
            icon={<ShieldAlert className="w-5 h-5" />}
            title="Dana darurat belum dikonfigurasi"
            description="Tetapkan target ideal (misalnya 6x–12x pengeluaran bulanan keluarga) dan hubungkan rekening penyimpanannya."
            actionLabel="Buat Target Dana Darurat"
            onAction={() => setEditTargetOpen(true)}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Target Dana Darurat" value={formatIDR(primaryFund.target_amount)} />
            <StatCard label="Dana Terkumpul" value={formatIDR(primaryFund.current_amount)} tone="positive" />
            <StatCard
              label="Kekurangan Dana"
              value={formatIDR(primaryFund.shortfall_amount)}
              tone={primaryFund.shortfall_amount > 0 ? 'warning' : 'positive'}
            />
            <StatCard
              label="Persentase Pencapaian"
              value={`${primaryFund.progress_percentage}%`}
              tone="positive"
              subtext={
                primaryFund.accounts && primaryFund.accounts.length > 0
                  ? `Tersimpan di ${primaryFund.accounts.map((a) => a.name).join(', ')}`
                  : 'Akun terhubung'
              }
            />
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-900">{primaryFund.name}</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                {primaryFund.progress_percentage}%
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all"
                style={{ width: `${primaryFund.progress_percentage}%` }}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-7 p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Perkembangan Dana Darurat</h2>
              <p className="text-xs text-slate-500 mb-4">Akumulasi saldo cadangan darurat dari waktu ke waktu</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={primaryFund.history_series || []}>
                    <defs>
                      <linearGradient id="efGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={(v) => formatIDRCompact(Number(v))}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={68}
                    />
                    <Tooltip formatter={(v) => formatIDR(Number(v ?? 0))} />
                    <Area type="monotone" dataKey="balance" name="Saldo" stroke="#059669" strokeWidth={2} fill="url(#efGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="lg:col-span-5 p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Riwayat Mutasi Dana Darurat</h2>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {(primaryFund.transactions || []).map((t) => (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {t.type === 'deposit' ? 'Penambahan Dana' : 'Penarikan Darurat'}
                      </p>
                      <p className="text-slate-500">
                        {formatDateID(t.transaction_date)} · {t.notes || t.actor_name}
                      </p>
                    </div>
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        t.type === 'deposit' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {t.type === 'deposit' ? '+' : '-'}
                      {formatIDR(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Deposit / Withdrawal Modal */}
      <Modal
        open={Boolean(txModalType)}
        onClose={() => setTxModalType(null)}
        title={txModalType === 'deposit' ? 'Tambah Dana Darurat' : 'Tarik Dana Darurat'}
        description="Perpindahan dana dicatat antar-akun tanpa mengganggu laporan pengeluaran konsumtif."
      >
        <form onSubmit={txForm.handleSubmit(handleTransact)} className="space-y-4">
          <Select
            label={txModalType === 'deposit' ? 'Dari Akun Sumber' : 'Ke Akun Tujuan'}
            {...txForm.register('account_id')}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatIDR(a.current_balance)})
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nominal (Rp)"
              type="number"
              min={1000}
              className="font-mono tabular-nums"
              {...txForm.register('amount')}
            />
            <Input label="Tanggal" type="date" {...txForm.register('transaction_date')} />
          </div>
          <Input label="Catatan" placeholder="Contoh: Setoran rutin bulan ini" {...txForm.register('notes')} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setTxModalType(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={txForm.formState.isSubmitting}>
              Simpan Mutasi
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Target Modal */}
      <Modal open={editTargetOpen} onClose={() => setEditTargetOpen(false)} title="Atur Target Dana Darurat">
        <form onSubmit={targetForm.handleSubmit(handleUpdateTarget)} className="space-y-4">
          <Input label="Nama Dana Darurat" {...targetForm.register('name')} />
          <Input
            label="Target Nominal (Rp)"
            type="number"
            min={100000}
            className="font-mono tabular-nums"
            {...targetForm.register('target_amount')}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setEditTargetOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={targetForm.formState.isSubmitting}>
              Simpan Target
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
