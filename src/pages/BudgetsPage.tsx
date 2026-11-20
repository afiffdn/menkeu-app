import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, PieChart, Plus, Trash2 } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { budgetsApi, categoriesApi, extractApiError } from '../services/api';
import type { Budget, Category, SpaceType } from '../types/finance';
import { formatIDR, getMonthNameID, getSpaceLabel } from '../utils/finance';
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, Select, StatCard } from '../components/ui/Primitives';

const budgetSchema = z.object({
  category_id: z.coerce.number().min(1, 'Kategori wajib dipilih'),
  period: z.enum(['monthly', 'yearly']),
  space: z.enum(['pribadi', 'keluarga', 'anak']),
  amount_limit: z.coerce.number().positive('Batas anggaran harus lebih besar dari 0'),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

export function BudgetsPage() {
  const { filters, dataVersion, triggerRefresh } = usePeriod();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spaceFilter, setSpaceFilter] = useState<SpaceType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof budgetSchema>, unknown, BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      category_id: 8,
      period: 'monthly',
      space: 'keluarga',
      amount_limit: 2000000,
    },
  });

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, cats] = await Promise.all([
        budgetsApi.list({ month: filters.month, year: filters.year, space: spaceFilter }),
        categoriesApi.list(),
      ]);
      setBudgets(list);
      setCategories(cats.filter((c) => c.type === 'expense'));
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filters.month, filters.year, spaceFilter]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets, dataVersion]);

  const onSubmit = async (values: BudgetFormValues) => {
    try {
      await budgetsApi.create({
        ...values,
        month: values.period === 'monthly' ? filters.month : null,
        year: filters.year,
      });
      setModalOpen(false);
      reset();
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await budgetsApi.remove(id);
      triggerRefresh();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const totalLimit = budgets.reduce((s, b) => s + b.amount_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent_amount, 0);
  const totalRemaining = Math.max(0, totalLimit - totalSpent);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Anggaran · {getMonthNameID(filters.month)} {filters.year}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Bandingkan target pengeluaran dengan realisasi aktual di tiap kategori.
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
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Atur Anggaran
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadBudgets} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Batas Anggaran" value={formatIDR(totalLimit)} subtext={`${budgets.length} kategori terpantau`} />
        <StatCard
          label="Pengeluaran Aktual"
          value={formatIDR(totalSpent)}
          tone={totalSpent > totalLimit ? 'negative' : 'neutral'}
          subtext={totalLimit > 0 ? `${Math.round((totalSpent / totalLimit) * 100)}% terpakai` : '-'}
        />
        <StatCard
          label="Sisa Kuota Anggaran"
          value={formatIDR(totalRemaining)}
          tone="positive"
          subtext="Tersisa hingga akhir periode"
        />
      </div>

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Memuat anggaran...</Card>
      ) : budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PieChart className="w-5 h-5" />}
            title="Belum ada anggaran pada periode ini"
            description="Buat batas pengeluaran per kategori agar arus kas keluarga tetap terkontrol."
            actionLabel="Buat Anggaran Baru"
            onAction={() => setModalOpen(true)}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((b) => {
            const barWidth = Math.min(100, b.usage_percentage);
            const barColor =
              b.status === 'exceeded' ? 'bg-red-600' : b.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-600';

            return (
              <Card key={b.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">
                      {b.period === 'monthly' ? 'Bulanan' : 'Tahunan'} · {getSpaceLabel(b.space)}
                    </p>
                    <h2 className="text-base font-semibold text-slate-900 mt-0.5">{b.category_name}</h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        b.status === 'exceeded'
                          ? 'text-red-600'
                          : b.status === 'warning'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {b.status === 'safe' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {b.status === 'exceeded'
                        ? 'Melebihi Batas'
                        : b.status === 'warning'
                        ? 'Mendekati Batas'
                        : 'Aman'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id)}
                      aria-label={`Hapus anggaran ${b.category_name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-700 font-semibold">
                      Terpakai {formatIDR(b.spent_amount)} ({b.usage_percentage}%)
                    </span>
                    <span className="text-slate-500">Batas {formatIDR(b.amount_limit)}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                  Sisa anggaran:{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatIDR(b.remaining_amount)}
                  </span>
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Atur Anggaran Kategori">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Select label="Kategori Pengeluaran" error={errors.category_id?.message} {...register('category_id')}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Periode" {...register('period')}>
              <option value="monthly">Bulanan ({getMonthNameID(filters.month)} {filters.year})</option>
              <option value="yearly">Tahunan ({filters.year})</option>
            </Select>

            <Select label="Ruang Keuangan" {...register('space')}>
              <option value="keluarga">Keluarga</option>
              <option value="pribadi">Pribadi</option>
              <option value="anak">Anak</option>
            </Select>
          </div>

          <Input
            label="Batas Nominal (Rp)"
            type="number"
            min={1000}
            step="1"
            className="font-mono tabular-nums"
            error={errors.amount_limit?.message}
            {...register('amount_limit')}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Menyimpan...' : 'Simpan Anggaran'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
