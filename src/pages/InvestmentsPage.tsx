import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, TrendingUp } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, extractApiError, investmentsApi } from '../services/api';
import type { Account, Investment } from '../types/finance';
import {
  formatDateID,
  formatIDR,
  formatNumberID,
  getInvestmentTypeLabel,
  getSpaceLabel,
  getTodayISO,
} from '../utils/finance';
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, Select, StatCard } from '../components/ui/Primitives';
import { optionalNullableIdSchema } from '../utils/formHelpers';

const createSchema = z.object({
  name: z.string().min(2, 'Nama aset wajib diisi'),
  platform: z.string().min(2, 'Platform wajib diisi'),
  type: z.enum(['digital_gold', 'mutual_fund', 'stock', 'deposit', 'other']),
  purchase_date: z.string().min(1),
  units: z.coerce.number().positive('Jumlah unit/gram harus > 0'),
  unit_label: z.string().min(1),
  buy_price_per_unit: z.coerce.number().positive('Harga beli wajib > 0'),
  current_market_price: z.coerce.number().positive('Harga pasar wajib > 0'),
  space: z.enum(['pribadi', 'keluarga', 'anak']),
  source_account_id: optionalNullableIdSchema,
});

const priceSchema = z.object({
  current_market_price: z.coerce.number().positive('Harga pasar harus lebih dari 0'),
});

const txSchema = z.object({
  type: z.enum(['buy', 'sell', 'dividend']),
  units: z.coerce.number().min(0, 'Jumlah unit minimal 0'),
  price_per_unit: z.coerce.number().positive('Nominal / harga wajib > 0'),
  account_id: optionalNullableIdSchema,
  transaction_date: z.string().min(1),
  notes: z.string().optional(),
});

export function InvestmentsPage() {
  const { dataVersion, triggerRefresh } = usePeriod();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<Investment | null>(null);
  const [transactingInv, setTransactingInv] = useState<Investment | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const createForm = useForm<z.input<typeof createSchema>, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      platform: '',
      type: 'digital_gold',
      purchase_date: getTodayISO(),
      units: 5,
      unit_label: 'gram',
      buy_price_per_unit: 1450000,
      current_market_price: 1465000,
      space: 'keluarga',
      source_account_id: null,
    },
  });

  const priceForm = useForm<z.input<typeof priceSchema>, unknown, z.output<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
  });

  const txForm = useForm<z.input<typeof txSchema>, unknown, z.output<typeof txSchema>>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      type: 'buy',
      units: 1,
      price_per_unit: 1465000,
      transaction_date: getTodayISO(),
      notes: '',
    },
  });

  const invType = createForm.watch('type');
  useEffect(() => {
    if (invType === 'digital_gold') createForm.setValue('unit_label', 'gram');
    else if (invType === 'stock') createForm.setValue('unit_label', 'lembar');
    else createForm.setValue('unit_label', 'unit');
  }, [invType, createForm]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, accs] = await Promise.all([investmentsApi.list(), accountsApi.list('all')]);
      setInvestments(list);
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

  const handleCreate = async (values: z.infer<typeof createSchema>) => {
    setModalError(null);
    try {
      await investmentsApi.create({
        ...values,
        source_account_id: values.source_account_id ?? null,
      });
      setCreateOpen(false);
      createForm.reset({
        name: '',
        platform: '',
        type: 'digital_gold',
        purchase_date: getTodayISO(),
        units: 5,
        unit_label: 'gram',
        buy_price_per_unit: 1450000,
        current_market_price: 1465000,
        space: 'keluarga',
        source_account_id: null,
      });
      triggerRefresh();
    } catch (err) {
      setModalError(extractApiError(err));
    }
  };

  const handleUpdatePrice = async (values: z.infer<typeof priceSchema>) => {
    if (!editingPrice) return;
    setModalError(null);
    try {
      await investmentsApi.updatePrice(editingPrice.id, values);
      setEditingPrice(null);
      triggerRefresh();
    } catch (err) {
      setModalError(extractApiError(err));
    }
  };

  const handleTransact = async (values: z.infer<typeof txSchema>) => {
    if (!transactingInv) return;
    setModalError(null);
    try {
      await investmentsApi.transact(transactingInv.id, {
        ...values,
        account_id: values.account_id ?? null,
      });
      setTransactingInv(null);
      triggerRefresh();
    } catch (err) {
      setModalError(extractApiError(err));
    }
  };

  const totalCost = investments.reduce((s, i) => s + i.total_cost, 0);
  const totalValue = investments.reduce((s, i) => s + i.current_value, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? Math.round((totalPL / totalCost) * 10000) / 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Investasi & Emas Digital
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Harga pasar terbaru menggunakan input manual terstruktur dan siap diintegrasikan ke API penyedia harga.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => {
            setModalError(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Catat Aset Investasi
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Modal Investasi" value={formatIDR(totalCost)} />
        <StatCard label="Estimasi Nilai Terkini" value={formatIDR(totalValue)} tone="positive" />
        <StatCard
          label="Keuntungan / Kerugian"
          value={`${totalPL >= 0 ? '+' : ''}${formatIDR(totalPL)}`}
          subtext={`${totalPLPct >= 0 ? '+' : ''}${totalPLPct}% dari modal`}
          tone={totalPL >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Memuat portofolio investasi...</Card>
      ) : investments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp className="w-5 h-5" />}
            title="Belum ada aset investasi"
            description="Catat kepemilikan emas digital (gram), reksa dana, saham, atau deposito keluarga Anda."
            actionLabel="Tambah Investasi Pertama"
            onAction={() => {
              setModalError(null);
              setCreateOpen(true);
            }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {investments.map((inv) => {
            const isGain = inv.profit_loss >= 0;
            return (
              <Card key={inv.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">
                      {getInvestmentTypeLabel(inv.type)} · {inv.platform} · {getSpaceLabel(inv.space)}
                    </p>
                    <h2 className="text-base font-semibold text-slate-900 mt-0.5">{inv.name}</h2>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      isGain ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {isGain ? '+' : ''}
                    {inv.profit_loss_percentage}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-slate-500">Kepemilikan</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      {formatNumberID(inv.units, 8)} {inv.unit_label}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Harga Beli Rata-rata</p>
                    <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                      {formatIDR(inv.buy_price_per_unit)}/{inv.unit_label}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Harga Pasar (Manual)</p>
                    <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                      {formatIDR(inv.current_market_price)}/{inv.unit_label}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Nilai Terkini</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      {formatIDR(inv.current_value)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    Modal: <strong className="font-mono text-slate-800">{formatIDR(inv.total_cost)}</strong> · P/L:{' '}
                    <strong className={`font-mono ${isGain ? 'text-emerald-700' : 'text-red-600'}`}>
                      {isGain ? '+' : ''}
                      {formatIDR(inv.profit_loss)}
                    </strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setModalError(null);
                        setEditingPrice(inv);
                        priceForm.setValue('current_market_price', inv.current_market_price);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Update Harga
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setModalError(null);
                        setTransactingInv(inv);
                        txForm.reset({
                          type: 'buy',
                          units: 1,
                          price_per_unit: inv.current_market_price,
                          account_id: accounts[0]?.id ?? null,
                          transaction_date: getTodayISO(),
                          notes: '',
                        });
                      }}
                    >
                      Beli / Jual
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Pembelian awal: {formatDateID(inv.purchase_date)} · Sumber harga: Input manual
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Investment Modal */}
      <Modal
        open={createOpen}
        onClose={() => {
          setModalError(null);
          setCreateOpen(false);
        }}
        title="Tambah Aset Investasi"
      >
        <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
          {modalError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nama Aset"
              placeholder="Contoh: Emas Antam Digital"
              error={createForm.formState.errors.name?.message}
              {...createForm.register('name')}
            />
            <Input
              label="Platform"
              placeholder="Contoh: Pegadaian / Bibit / Stockbit"
              error={createForm.formState.errors.platform?.message}
              {...createForm.register('platform')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Jenis Investasi" {...createForm.register('type')}>
              <option value="digital_gold">Emas Digital (gram)</option>
              <option value="mutual_fund">Reksa Dana</option>
              <option value="stock">Saham</option>
              <option value="deposit">Deposito</option>
              <option value="other">Investasi Lainnya</option>
            </Select>
            <Input
              label="Tanggal Pembelian"
              type="date"
              error={createForm.formState.errors.purchase_date?.message}
              {...createForm.register('purchase_date')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Jumlah (Unit/Gram)"
              type="number"
              step="any"
              className="font-mono tabular-nums"
              error={createForm.formState.errors.units?.message}
              {...createForm.register('units')}
            />
            <Input
              label="Satuan"
              error={createForm.formState.errors.unit_label?.message}
              {...createForm.register('unit_label')}
            />
            <Select label="Ruang" {...createForm.register('space')}>
              <option value="keluarga">Keluarga</option>
              <option value="pribadi">Pribadi</option>
              <option value="anak">Anak</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Harga Beli per Satuan (Rp)"
              type="number"
              step="any"
              className="font-mono tabular-nums"
              error={createForm.formState.errors.buy_price_per_unit?.message}
              {...createForm.register('buy_price_per_unit')}
            />
            <Input
              label="Harga Pasar Saat Ini (Rp)"
              type="number"
              step="any"
              className="font-mono tabular-nums"
              error={createForm.formState.errors.current_market_price?.message}
              {...createForm.register('current_market_price')}
            />
          </div>

          <Select
            label="Potong Saldo dari Akun (Opsional)"
            error={createForm.formState.errors.source_account_id?.message}
            {...createForm.register('source_account_id')}
          >
            <option value="">Hanya catat portofolio (tanpa mutasi kas)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatIDR(a.current_balance)})
              </option>
            ))}
          </Select>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalError(null);
                setCreateOpen(false);
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={createForm.formState.isSubmitting}>
              Simpan Investasi
            </Button>
          </div>
        </form>
      </Modal>

      {/* Update Market Price Modal */}
      <Modal
        open={Boolean(editingPrice)}
        onClose={() => {
          setModalError(null);
          setEditingPrice(null);
        }}
        title={`Perbarui Harga Pasar · ${editingPrice?.name || ''}`}
        description="Masukkan harga pasar terbaru per unit/gram untuk menghitung estimasi keuntungan/kerugian."
        maxWidth="max-w-md"
      >
        <form onSubmit={priceForm.handleSubmit(handleUpdatePrice)} className="space-y-4">
          {modalError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {modalError}
            </div>
          )}
          <Input
            label={`Harga Pasar Terbaru per ${editingPrice?.unit_label || 'unit'} (Rp)`}
            type="number"
            step="any"
            className="font-mono tabular-nums"
            error={priceForm.formState.errors.current_market_price?.message}
            {...priceForm.register('current_market_price')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalError(null);
                setEditingPrice(null);
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={priceForm.formState.isSubmitting}>
              Simpan Harga Baru
            </Button>
          </div>
        </form>
      </Modal>

      {/* Buy/Sell/Dividend Modal */}
      <Modal
        open={Boolean(transactingInv)}
        onClose={() => {
          setModalError(null);
          setTransactingInv(null);
        }}
        title={`Transaksi Aset · ${transactingInv?.name || ''}`}
      >
        <form onSubmit={txForm.handleSubmit(handleTransact)} className="space-y-4">
          {modalError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {modalError}
            </div>
          )}
          <Select label="Jenis Aksi" {...txForm.register('type')}>
            <option value="buy">Beli / Top-Up Unit</option>
            <option value="sell">Jual Unit</option>
            <option value="dividend">Dividen / Imbal Hasil</option>
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`Jumlah ${transactingInv?.unit_label || 'Unit'}`}
              type="number"
              step="any"
              className="font-mono tabular-nums"
              error={txForm.formState.errors.units?.message}
              {...txForm.register('units')}
            />
            <Input
              label="Harga per Unit / Nominal Dividen (Rp)"
              type="number"
              step="any"
              className="font-mono tabular-nums"
              error={txForm.formState.errors.price_per_unit?.message}
              {...txForm.register('price_per_unit')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Akun Kas Terkait"
              error={txForm.formState.errors.account_id?.message}
              {...txForm.register('account_id')}
            >
              <option value="">Tanpa mutasi akun kas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Input
              label="Tanggal"
              type="date"
              error={txForm.formState.errors.transaction_date?.message}
              {...txForm.register('transaction_date')}
            />
          </div>
          <Input label="Catatan" {...txForm.register('notes')} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalError(null);
                setTransactingInv(null);
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={txForm.formState.isSubmitting}>
              Catat Transaksi
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
