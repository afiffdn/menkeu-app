import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, CreditCard, Plus } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, billsApi, extractApiError } from '../services/api';
import type { Account, Bill } from '../types/finance';
import {
  formatDateID,
  formatIDR,
  getBillFrequencyLabel,
  getFutureDateISO,
  getSpaceLabel,
  getTodayISO,
} from '../utils/finance';
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, Select, StatCard } from '../components/ui/Primitives';
import { optionalNullableIdSchema } from '../utils/formHelpers';

const billSchema = z.object({
  name: z.string().min(2, 'Nama tagihan wajib diisi'),
  amount: z.coerce.number().positive('Nominal harus lebih dari 0'),
  due_date: z.string().min(1, 'Tanggal jatuh tempo wajib diisi'),
  frequency: z.enum(['once', 'weekly', 'monthly', 'yearly']),
  account_id: optionalNullableIdSchema,
  space: z.enum(['pribadi', 'keluarga', 'anak']),
});

const paySchema = z.object({
  account_id: z.coerce.number().min(1, 'Pilih akun pembayaran'),
  amount_paid: z.coerce.number().positive('Nominal harus lebih dari 0'),
  paid_date: z.string().min(1),
  notes: z.string().optional(),
});

export function BillsPage() {
  const { dataVersion, triggerRefresh } = usePeriod();
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);

  const billForm = useForm<z.input<typeof billSchema>, unknown, z.output<typeof billSchema>>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      name: '',
      amount: 500000,
      due_date: getFutureDateISO(7),
      frequency: 'monthly',
      space: 'keluarga',
    },
  });

  const payForm = useForm<z.input<typeof paySchema>, unknown, z.output<typeof paySchema>>({
    resolver: zodResolver(paySchema),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, accs] = await Promise.all([billsApi.list(), accountsApi.list('all')]);
      setBills(list);
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

  const handleCreate = async (values: z.infer<typeof billSchema>) => {
    try {
      await billsApi.create({
        ...values,
        account_id: values.account_id ?? null,
      });
      setCreateOpen(false);
      billForm.reset({
        name: '',
        amount: 500000,
        due_date: getFutureDateISO(7),
        frequency: 'monthly',
        account_id: null,
        space: 'keluarga',
      });
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handlePay = async (values: z.infer<typeof paySchema>) => {
    if (!payingBill) return;
    try {
      await billsApi.pay(payingBill.id, values);
      setPayingBill(null);
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const unpaidTotal = bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + b.amount, 0);
  const overdueCount = bills.filter((b) => b.status === 'overdue').length;
  const paidTotal = bills.filter((b) => b.status === 'paid').reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Tagihan & Cicilan</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pantau jatuh tempo listrik, internet, cicilan rumah/kendaraan, dan riwayat pembayarannya.
          </p>
        </div>

        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Tambah Tagihan
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Belum Dibayar / Jatuh Tempo"
          value={formatIDR(unpaidTotal)}
          tone={overdueCount > 0 ? 'negative' : 'warning'}
          subtext={overdueCount > 0 ? `${overdueCount} tagihan melewati jatuh tempo` : 'Jadwal terpantau'}
        />
        <StatCard label="Sudah Dibayar Periode Ini" value={formatIDR(paidTotal)} tone="positive" />
        <StatCard label="Total Tagihan Terdaftar" value={String(bills.length)} subtext="Tagihan rutin & cicilan" />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat daftar tagihan...</div>
        ) : bills.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="w-5 h-5" />}
            title="Belum ada jadwal tagihan"
            description="Tambahkan tagihan bulanan atau cicilan untuk mendapatkan pengingat jatuh tempo."
            actionLabel="Tambah Tagihan Pertama"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Nama Tagihan</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                  <th className="py-3 px-4">Frekuensi & Ruang</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{bill.name}</p>
                      {bill.account_name && <p className="text-slate-500">Akun default: {bill.account_name}</p>}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                      {formatDateID(bill.due_date)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      {getBillFrequencyLabel(bill.frequency)} · {getSpaceLabel(bill.space)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {bill.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                        </span>
                      ) : bill.status === 'overdue' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                          <AlertCircle className="w-3.5 h-3.5" /> Terlambat
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700">Belum Dibayar</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatIDR(bill.amount)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {bill.status !== 'paid' ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setPayingBill(bill);
                            payForm.reset({
                              account_id: bill.account_id || accounts[0]?.id || 1,
                              amount_paid: bill.amount,
                              paid_date: getTodayISO(),
                              notes: '',
                            });
                          }}
                        >
                          Bayar Sekarang
                        </Button>
                      ) : (
                        <span className="text-slate-400">Tercatat</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Bill Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tambah Tagihan / Cicilan">
        <form onSubmit={billForm.handleSubmit(handleCreate)} className="space-y-4">
          <Input
            label="Nama Tagihan"
            placeholder="Contoh: Tagihan Internet Rumah"
            error={billForm.formState.errors.name?.message}
            {...billForm.register('name')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nominal (Rp)"
              type="number"
              className="font-mono tabular-nums"
              error={billForm.formState.errors.amount?.message}
              {...billForm.register('amount')}
            />
            <Input label="Tanggal Jatuh Tempo" type="date" {...billForm.register('due_date')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Frekuensi Pembayaran" {...billForm.register('frequency')}>
              <option value="monthly">Bulanan</option>
              <option value="yearly">Tahunan</option>
              <option value="weekly">Mingguan</option>
              <option value="once">Sekali</option>
            </Select>
            <Select label="Ruang Keuangan" {...billForm.register('space')}>
              <option value="keluarga">Keluarga</option>
              <option value="pribadi">Pribadi</option>
              <option value="anak">Anak</option>
            </Select>
          </div>
          <Select label="Akun Pembayaran Default" {...billForm.register('account_id')}>
            <option value="">Pilih saat membayar</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={billForm.formState.isSubmitting}>
              Simpan Tagihan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Pay Bill Modal */}
      <Modal
        open={Boolean(payingBill)}
        onClose={() => setPayingBill(null)}
        title={`Bayar Tagihan · ${payingBill?.name || ''}`}
        description="Pembayaran otomatis mencatat transaksi pengeluaran dan memotong saldo akun terpilih."
      >
        <form onSubmit={payForm.handleSubmit(handlePay)} className="space-y-4">
          <Select label="Bayar Dari Akun" {...payForm.register('account_id')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatIDR(a.current_balance)})
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nominal Dibayar (Rp)"
              type="number"
              className="font-mono tabular-nums"
              {...payForm.register('amount_paid')}
            />
            <Input label="Tanggal Pembayaran" type="date" {...payForm.register('paid_date')} />
          </div>
          <Input label="Catatan (Opsional)" {...payForm.register('notes')} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setPayingBill(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={payForm.formState.isSubmitting}>
              Konfirmasi Pembayaran
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
