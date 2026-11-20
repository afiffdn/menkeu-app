import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { History, PiggyBank, Plus } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, extractApiError, savingsApi } from '../services/api';
import type { Account, SavingsGoal } from '../types/finance';
import { formatDateID, formatIDR, getFutureDateISO, getSpaceLabel, getTodayISO } from '../utils/finance';
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, Select, StatCard } from '../components/ui/Primitives';
import { optionalNullableIdSchema } from '../utils/formHelpers';

const goalSchema = z.object({
  name: z.string().min(2, 'Nama target minimal 2 karakter'),
  target_amount: z.coerce.number().positive('Target nominal harus lebih dari 0'),
  start_date: z.string().min(1, 'Tanggal mulai wajib diisi'),
  target_date: z.string().min(1, 'Target selesai wajib diisi'),
  account_id: optionalNullableIdSchema,
  space: z.enum(['pribadi', 'keluarga', 'anak']),
});

const contributionSchema = z.object({
  source_account_id: z.coerce.number().min(1, 'Pilih akun sumber'),
  amount: z.coerce.number().positive('Nominal setoran harus lebih dari 0'),
  contribution_date: z.string().min(1, 'Tanggal wajib diisi'),
  notes: z.string().optional(),
});

export function SavingsPage() {
  const { dataVersion, triggerRefresh } = usePeriod();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [contributingGoal, setContributingGoal] = useState<SavingsGoal | null>(null);
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null);

  const goalForm = useForm<z.input<typeof goalSchema>, unknown, z.output<typeof goalSchema>>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: '',
      target_amount: 10000000,
      start_date: getTodayISO(),
      target_date: getFutureDateISO(365),
      space: 'keluarga',
    },
  });

  const contribForm = useForm<z.input<typeof contributionSchema>, unknown, z.output<typeof contributionSchema>>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      source_account_id: 1,
      amount: 1000000,
      contribution_date: getTodayISO(),
      notes: '',
    },
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gList, accs] = await Promise.all([savingsApi.list(), accountsApi.list('all')]);
      setGoals(gList);
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

  const handleCreateGoal = async (values: z.infer<typeof goalSchema>) => {
    try {
      await savingsApi.create({
        ...values,
        account_id: values.account_id ?? null,
      });
      setCreateOpen(false);
      goalForm.reset({
        name: '',
        target_amount: 10000000,
        start_date: getTodayISO(),
        target_date: getFutureDateISO(365),
        account_id: null,
        space: 'keluarga',
      });
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleContribute = async (values: z.infer<typeof contributionSchema>) => {
    if (!contributingGoal) return;
    try {
      await savingsApi.contribute(contributingGoal.id, values);
      setContributingGoal(null);
      contribForm.reset({
        source_account_id: accounts[0]?.id ?? 1,
        amount: 1000000,
        contribution_date: getTodayISO(),
        notes: '',
      });
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.current_amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Tabungan & Target</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Setoran ke tabungan target dicatat sebagai transfer aset, bukan pengeluaran konsumtif.
          </p>
        </div>

        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Target Tabungan Baru
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Dana Terkumpul" value={formatIDR(totalSaved)} tone="positive" />
        <StatCard label="Total Target Tabungan" value={formatIDR(totalTarget)} />
        <StatCard
          label="Kekurangan Keseluruhan"
          value={formatIDR(Math.max(0, totalTarget - totalSaved))}
          subtext={`${goals.filter((g) => g.status === 'completed').length} target tercapai`}
        />
      </div>

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Memuat target tabungan...</Card>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PiggyBank className="w-5 h-5" />}
            title="Belum ada target tabungan"
            description="Buat target tabungan rumah, pendidikan anak, kendaraan, atau liburan keluarga."
            actionLabel="Buat Target Pertama"
            onAction={() => setCreateOpen(true)}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => (
            <Card key={goal.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">
                    {getSpaceLabel(goal.space)} · Target {formatDateID(goal.target_date)}
                  </p>
                  <h2 className="text-base font-semibold text-slate-900 mt-0.5">{goal.name}</h2>
                  {goal.account_name && (
                    <p className="text-[11px] text-slate-500 mt-0.5">Penyimpanan: {goal.account_name}</p>
                  )}
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-700">
                  {goal.progress_percentage}%
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${goal.progress_percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono tabular-nums">
                  <span className="font-semibold text-slate-900">{formatIDR(goal.current_amount)}</span>
                  <span className="text-slate-500">Target {formatIDR(goal.target_amount)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setHistoryGoal(goal)}>
                  <History className="w-3.5 h-3.5" />
                  Riwayat ({goal.contributions?.length ?? 0})
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setContributingGoal(goal);
                    contribForm.setValue('source_account_id', accounts[0]?.id ?? 1);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Setoran
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Goal Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Buat Target Tabungan">
        <form onSubmit={goalForm.handleSubmit(handleCreateGoal)} className="space-y-4">
          <Input
            label="Nama Target"
            placeholder="Contoh: Tabungan Pendidikan Anak"
            error={goalForm.formState.errors.name?.message}
            {...goalForm.register('name')}
          />
          <Input
            label="Nominal Target (Rp)"
            type="number"
            min={100000}
            className="font-mono tabular-nums"
            error={goalForm.formState.errors.target_amount?.message}
            {...goalForm.register('target_amount')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Tanggal Mulai" type="date" {...goalForm.register('start_date')} />
            <Input label="Target Selesai" type="date" {...goalForm.register('target_date')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Akun Penyimpanan" {...goalForm.register('account_id')}>
              <option value="">Tidak terhubung ke akun spesifik</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select label="Ruang Keuangan" {...goalForm.register('space')}>
              <option value="keluarga">Keluarga</option>
              <option value="pribadi">Pribadi</option>
              <option value="anak">Anak</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={goalForm.formState.isSubmitting}>
              Simpan Target
            </Button>
          </div>
        </form>
      </Modal>

      {/* Contribution Modal */}
      <Modal
        open={Boolean(contributingGoal)}
        onClose={() => setContributingGoal(null)}
        title={`Setor ke ${contributingGoal?.name || ''}`}
        description="Dana akan dialokasikan dari akun sumber tanpa dihitung sebagai pengeluaran konsumtif."
      >
        <form onSubmit={contribForm.handleSubmit(handleContribute)} className="space-y-4">
          <Select label="Akun Sumber Dana" {...contribForm.register('source_account_id')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatIDR(a.current_balance)})
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nominal Setoran (Rp)"
              type="number"
              min={1000}
              className="font-mono tabular-nums"
              error={contribForm.formState.errors.amount?.message}
              {...contribForm.register('amount')}
            />
            <Input label="Tanggal Setor" type="date" {...contribForm.register('contribution_date')} />
          </div>
          <Input label="Catatan" placeholder="Contoh: Sisihan gaji bulan ini" {...contribForm.register('notes')} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setContributingGoal(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={contribForm.formState.isSubmitting}>
              Catat Setoran
            </Button>
          </div>
        </form>
      </Modal>

      {/* History Modal */}
      <Modal
        open={Boolean(historyGoal)}
        onClose={() => setHistoryGoal(null)}
        title={`Riwayat Setoran · ${historyGoal?.name || ''}`}
      >
        {!historyGoal?.contributions || historyGoal.contributions.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">Belum ada riwayat setoran.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {historyGoal.contributions.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-slate-900">{c.notes || 'Setoran Tabungan'}</p>
                  <p className="text-slate-500">
                    {formatDateID(c.contribution_date)} · {c.contributor_name}
                    {c.source_account_name ? ` · dari ${c.source_account_name}` : ''}
                  </p>
                </div>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  +{formatIDR(c.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
