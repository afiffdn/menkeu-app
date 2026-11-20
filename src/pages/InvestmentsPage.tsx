import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ExternalLink, Pencil, Plus, TrendingUp } from 'lucide-react';
import { usePeriod } from '../hooks/usePeriod';
import { accountsApi, extractApiError, investmentsApi } from '../services/api';
import type { Account, Investment, InvestmentType } from '../types/finance';
import {
  formatDateID,
  formatIDR,
  formatNumberID,
  getInvestmentTypeLabel,
  getSpaceLabel,
  getTodayISO,
} from '../utils/finance';
import { Button, Card, EmptyState, ErrorBanner, Input, Modal, Select, StatCard } from '../components/ui/Primitives';
import {
  computeInvestmentPreview,
  convertLotsToShares,
  flexibleNonNegativeNumberSchema,
  flexiblePositiveNumberSchema,
  formatSharesWithLots,
  normalizeAssetCode,
  optionalNullableIdSchema,
  parseFlexibleNumber,
} from '../utils/formHelpers';

const OFFICIAL_PRICE_PORTALS: Array<{
  label: string;
  url: string;
  types: InvestmentType[];
}> = [
  {
    label: 'Logam Mulia Antam',
    url: 'https://www.logammulia.com/id/harga-emas-hari-ini',
    types: ['digital_gold'],
  },
  {
    label: 'Pegadaian Emas',
    url: 'https://www.pegadaian.co.id/harga-emas',
    types: ['digital_gold'],
  },
  {
    label: 'BEI / IDX',
    url: 'https://www.idx.co.id',
    types: ['stock', 'mutual_fund'],
  },
  {
    label: 'PHEI Obligasi & SBN',
    url: 'https://www.phei.co.id',
    types: ['bond'],
  },
];

const createSchema = z.object({
  name: z.string().min(2, 'Nama aset wajib diisi'),
  platform: z.string().min(2, 'Platform wajib diisi'),
  asset_code: z.string().max(40, 'Maksimal 40 karakter').optional(),
  type: z.enum(['digital_gold', 'mutual_fund', 'stock', 'bond', 'deposit', 'other']),
  purchase_date: z.string().min(1),
  units: flexiblePositiveNumberSchema('Jumlah unit/gram harus > 0'),
  unit_label: z.string().min(1),
  buy_price_per_unit: flexiblePositiveNumberSchema('Harga beli wajib > 0'),
  current_market_price: flexiblePositiveNumberSchema('Harga pasar wajib > 0'),
  space: z.enum(['pribadi', 'keluarga', 'anak']),
  source_account_id: optionalNullableIdSchema,
});

const priceSchema = z.object({
  current_market_price: flexiblePositiveNumberSchema('Harga pasar harus lebih dari 0'),
});

const txSchema = z.object({
  type: z.enum(['buy', 'sell', 'dividend']),
  units: flexibleNonNegativeNumberSchema('Jumlah unit minimal 0'),
  price_per_unit: flexiblePositiveNumberSchema('Nominal / harga wajib > 0'),
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
  const [lotHelperInput, setLotHelperInput] = useState('');

  const createForm = useForm<z.input<typeof createSchema>, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      platform: '',
      asset_code: '',
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
  const createUnitsWatch = createForm.watch('units');
  const createUnitLabelWatch = createForm.watch('unit_label');
  const createBuyPriceWatch = createForm.watch('buy_price_per_unit');
  const createMarketPriceWatch = createForm.watch('current_market_price');

  const createPreview = computeInvestmentPreview(
    createUnitsWatch,
    createBuyPriceWatch,
    createMarketPriceWatch
  );

  const editMarketPriceWatch = priceForm.watch('current_market_price');
  const parsedEditMarketPrice = parseFlexibleNumber(editMarketPriceWatch);

  const txTypeWatch = txForm.watch('type');
  const txUnitsWatch = txForm.watch('units');
  const txPriceWatch = txForm.watch('price_per_unit');
  const parsedTxUnits = parseFlexibleNumber(txUnitsWatch);
  const parsedTxPrice = parseFlexibleNumber(txPriceWatch);
  const estimatedTxTotal =
    txTypeWatch === 'dividend'
      ? Number.isFinite(parsedTxPrice) && parsedTxPrice > 0
        ? parsedTxPrice
        : 0
      : Number.isFinite(parsedTxUnits) &&
          parsedTxUnits > 0 &&
          Number.isFinite(parsedTxPrice) &&
          parsedTxPrice > 0
        ? Math.round(parsedTxUnits * parsedTxPrice * 100) / 100
        : 0;

  useEffect(() => {
    if (invType === 'digital_gold') createForm.setValue('unit_label', 'gram');
    else if (invType === 'stock') createForm.setValue('unit_label', 'lembar');
    else if (invType === 'deposit') createForm.setValue('unit_label', 'bilyet');
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
        asset_code: normalizeAssetCode(values.asset_code),
        source_account_id: values.source_account_id ?? null,
      });
      setCreateOpen(false);
      setLotHelperInput('');
      createForm.reset({
        name: '',
        platform: '',
        asset_code: '',
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

  const totalCost = investments.reduce((s, i) => s + Number(i.total_cost || 0), 0);
  const totalValue = investments.reduce((s, i) => s + Number(i.current_value || 0), 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? Math.round((totalPL / totalCost) * 10000) / 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Investasi & Emas Digital
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pencatatan manual terstruktur agar nilai portofolio 100% sesuai akun investasi asli Anda.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
            <span>Cek harga resmi:</span>
            {OFFICIAL_PRICE_PORTALS.map((portal) => (
              <a
                key={portal.url}
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 hover:underline font-medium"
              >
                {portal.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          className="shrink-0"
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
            description="Catat kepemilikan emas digital (gram), saham, reksa dana, obligasi/SBN, atau deposito keluarga Anda."
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
            const unitsNum = Number(inv.units || 0);
            const profitLossNum = Number(inv.profit_loss || 0);
            const profitLossPctNum = Number(inv.profit_loss_percentage || 0);
            const isGain = profitLossNum >= 0;
            return (
              <Card key={inv.id} className="p-5 space-y-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {getInvestmentTypeLabel(inv.type)} · {inv.platform} · {getSpaceLabel(inv.space)}
                    </p>
                    <h2 className="text-base font-semibold text-slate-900 mt-0.5 break-words">
                      {inv.name}
                      {inv.asset_code && (
                        <span className="inline-block ml-2 px-1.5 py-0.5 text-[11px] font-mono font-medium bg-slate-100 text-slate-700 rounded border border-slate-200 align-middle">
                          {inv.asset_code}
                        </span>
                      )}
                    </h2>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold shrink-0 ${
                      isGain ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {isGain ? '+' : ''}
                    {profitLossPctNum}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs pt-2 border-t border-slate-100">
                  <div className="min-w-0">
                    <p className="text-slate-500">Kepemilikan</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5 break-words">
                      {formatNumberID(unitsNum, 8)} {inv.unit_label}
                    </p>
                    {inv.type === 'stock' && inv.unit_label.toLowerCase() === 'lembar' && formatSharesWithLots(unitsNum) && (
                      <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        ({formatSharesWithLots(unitsNum)})
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-500">Harga Beli Rata-rata</p>
                    <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5 break-words">
                      {formatIDR(inv.buy_price_per_unit)}/{inv.unit_label}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-500">Harga Pasar (Manual)</p>
                    <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5 break-words">
                      {formatIDR(inv.current_market_price)}/{inv.unit_label}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-500">Nilai Terkini</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5 break-words">
                      {formatIDR(inv.current_value)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 break-words">
                    Modal: <strong className="font-mono text-slate-800">{formatIDR(inv.total_cost)}</strong> · P/L:{' '}
                    <strong className={`font-mono ${isGain ? 'text-emerald-700' : 'text-red-600'}`}>
                      {isGain ? '+' : ''}
                      {formatIDR(profitLossNum)}
                    </strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setModalError(null);
                        setEditingPrice(inv);
                        priceForm.setValue('current_market_price', Number(inv.current_market_price));
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
                          price_per_unit: Number(inv.current_market_price),
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
              placeholder={
                invType === 'bond'
                  ? 'Contoh: ORI026-T3 / Sukuk Ritel SR021'
                  : invType === 'stock'
                    ? 'Contoh: Saham Bank Central Asia'
                    : 'Contoh: Emas Antam Digital'
              }
              error={createForm.formState.errors.name?.message}
              {...createForm.register('name')}
            />
            <Input
              label="Kode Ticker / Seri (Opsional)"
              placeholder="Contoh: BBCA, ORI026, SR021, RDPU"
              className="font-mono uppercase"
              error={createForm.formState.errors.asset_code?.message}
              {...createForm.register('asset_code')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Jenis Investasi" {...createForm.register('type')}>
              <option value="digital_gold">Emas Digital (gram)</option>
              <option value="mutual_fund">Reksa Dana</option>
              <option value="stock">Saham</option>
              <option value="bond">Obligasi / SBN</option>
              <option value="deposit">Deposito</option>
              <option value="other">Investasi Lainnya</option>
            </Select>
            <Input
              label="Platform"
              placeholder="Contoh: Pegadaian / Bibit / Stockbit / Bareksa"
              error={createForm.formState.errors.platform?.message}
              {...createForm.register('platform')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Tanggal Pembelian"
              type="date"
              error={createForm.formState.errors.purchase_date?.message}
              {...createForm.register('purchase_date')}
            />
            <Select label="Ruang" {...createForm.register('space')}>
              <option value="keluarga">Keluarga</option>
              <option value="pribadi">Pribadi</option>
              <option value="anak">Anak</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Jumlah (Unit/Gram)"
                type="text"
                inputMode="decimal"
                placeholder={
                  invType === 'stock'
                    ? 'Contoh: 100000 atau 100.000.000'
                    : invType === 'digital_gold'
                      ? 'Contoh: 2.661654'
                      : invType === 'bond'
                        ? 'Contoh: 50 (untuk Rp50 juta SBN)'
                        : 'Contoh: 12500.5'
                }
                className="font-mono tabular-nums"
                error={createForm.formState.errors.units?.message}
                {...createForm.register('units')}
              />
              {Number.isFinite(createPreview.units) && createPreview.units > 0 && (
                <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums break-words">
                  = {formatNumberID(createPreview.units, 8)} {createUnitLabelWatch || 'unit'}
                  {invType === 'stock' &&
                    (createUnitLabelWatch || '').toLowerCase() === 'lembar' &&
                    formatSharesWithLots(createPreview.units) && (
                      <> ({formatSharesWithLots(createPreview.units)})</>
                    )}
                </p>
              )}
            </div>
            <div>
              <Input
                label="Satuan"
                error={createForm.formState.errors.unit_label?.message}
                {...createForm.register('unit_label')}
              />
              {invType === 'stock' && (
                <p className="text-[11px] text-slate-400 mt-1">BEI: 1 lot = 100 lembar</p>
              )}
            </div>
          </div>

          {invType === 'stock' && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                Punya jumlah dalam <strong>Lot BEI</strong>? (1 lot = 100 lembar)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Jumlah Lot BEI"
                  placeholder="Misal: 1000"
                  value={lotHelperInput}
                  onChange={(e) => setLotHelperInput(e.target.value)}
                  className="w-28 h-8 px-2.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const shares = convertLotsToShares(lotHelperInput);
                    if (shares > 0) {
                      createForm.setValue('units', shares, { shouldValidate: true });
                      createForm.setValue('unit_label', 'lembar', { shouldValidate: true });
                    }
                  }}
                >
                  Konversi ke Lembar
                </Button>
              </div>
            </div>
          )}

          {invType === 'digital_gold' && (
            <p className="text-[11px] text-slate-400 -mt-1">
              Standar Pegadaian / Pluang mendukung pecahan emas digital mulai 0,01 gram dengan presisi hingga 4–8 desimal.
            </p>
          )}
          {invType === 'mutual_fund' && (
            <p className="text-[11px] text-slate-400 -mt-1">
              Standar OJK (POJK 56/2020): Unit Penyertaan &amp; NAB/UP mendukung pencatatan hingga 4+ angka desimal.
            </p>
          )}
          {invType === 'bond' && (
            <p className="text-[11px] text-slate-400 -mt-1">
              SBN Ritel (ORI/SR/SBR/ST): umumnya 1 unit = Rp1.000.000; untuk obligasi pasar sekunder isi harga pasar per unit saat ini.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label={
                  invType === 'mutual_fund'
                    ? 'NAB Beli per unit (Rp)'
                    : `Harga Beli per ${createUnitLabelWatch || 'satuan'} (Rp)`
                }
                type="text"
                inputMode="decimal"
                placeholder="Contoh: 5000 atau 2.195.211"
                className="font-mono tabular-nums"
                error={createForm.formState.errors.buy_price_per_unit?.message}
                {...createForm.register('buy_price_per_unit')}
              />
              {Number.isFinite(createPreview.buyPrice) && createPreview.buyPrice > 0 && (
                <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums break-words">
                  = {formatIDR(createPreview.buyPrice)}
                </p>
              )}
            </div>
            <div>
              <Input
                label={
                  invType === 'mutual_fund'
                    ? 'NAB Pasar Saat Ini (Rp)'
                    : `Harga Pasar per ${createUnitLabelWatch || 'satuan'} (Rp)`
                }
                type="text"
                inputMode="decimal"
                placeholder="Contoh: 5250 atau 2.195.211"
                className="font-mono tabular-nums"
                error={createForm.formState.errors.current_market_price?.message}
                {...createForm.register('current_market_price')}
              />
              {Number.isFinite(createPreview.marketPrice) && createPreview.marketPrice > 0 && (
                <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums break-words">
                  = {formatIDR(createPreview.marketPrice)}
                </p>
              )}
            </div>
          </div>

          {createPreview.valid && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
              <div className="min-w-0">
                <p className="text-slate-500">Estimasi Total Modal</p>
                <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5 break-words">
                  {formatIDR(createPreview.totalCost)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-slate-500">Estimasi Nilai Kini</p>
                <p className="font-mono tabular-nums font-semibold text-emerald-700 mt-0.5 break-words">
                  {formatIDR(createPreview.currentValue)}
                </p>
              </div>
            </div>
          )}

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
          <div>
            <Input
              label={`Harga Pasar Terbaru per ${editingPrice?.unit_label || 'unit'} (Rp)`}
              type="text"
              inputMode="decimal"
              className="font-mono tabular-nums"
              error={priceForm.formState.errors.current_market_price?.message}
              {...priceForm.register('current_market_price')}
            />
            {Number.isFinite(parsedEditMarketPrice) && parsedEditMarketPrice > 0 && (
              <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums break-words">
                = {formatIDR(parsedEditMarketPrice)}/{editingPrice?.unit_label || 'unit'}
              </p>
            )}
          </div>
          {editingPrice && OFFICIAL_PRICE_PORTALS.some((p) => p.types.includes(editingPrice.type)) && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Referensi resmi:</span>
              {OFFICIAL_PRICE_PORTALS.filter((p) => p.types.includes(editingPrice.type)).map((portal) => (
                <a
                  key={portal.url}
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 hover:underline font-medium"
                >
                  {portal.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
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
            <option value="dividend">Dividen / Kupon / Imbal Hasil</option>
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label={`Jumlah ${transactingInv?.unit_label || 'Unit'}`}
                type="text"
                inputMode="decimal"
                placeholder="Contoh: 100.000 atau 0.123456"
                className="font-mono tabular-nums"
                error={txForm.formState.errors.units?.message}
                {...txForm.register('units')}
              />
              {Number.isFinite(parsedTxUnits) && parsedTxUnits >= 0 && (
                <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums break-words">
                  = {formatNumberID(parsedTxUnits, 8)} {transactingInv?.unit_label || 'unit'}
                </p>
              )}
            </div>
            <div>
              <Input
                label={
                  txTypeWatch === 'dividend'
                    ? 'Nominal Dividen / Kupon (Rp)'
                    : 'Harga per Unit / Satuan (Rp)'
                }
                type="text"
                inputMode="decimal"
                placeholder="Contoh: 5.000"
                className="font-mono tabular-nums"
                error={txForm.formState.errors.price_per_unit?.message}
                {...txForm.register('price_per_unit')}
              />
              {Number.isFinite(parsedTxPrice) && parsedTxPrice > 0 && (
                <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums break-words">
                  = {formatIDR(parsedTxPrice)}
                </p>
              )}
            </div>
          </div>
          {estimatedTxTotal > 0 && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Estimasi Total Transaksi</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 break-words">
                {formatIDR(estimatedTxTotal)}
              </span>
            </div>
          )}
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
