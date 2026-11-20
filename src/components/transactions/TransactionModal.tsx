import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Paperclip, Upload } from 'lucide-react';
import { accountsApi, categoriesApi, extractApiError, transactionsApi } from '../../services/api';
import type { Account, Category, SpaceType, Transaction, TransactionType } from '../../types/finance';
import { formatIDR, generateIdempotencyKey, getTodayISO } from '../../utils/finance';
import { Button, Input, Modal, Select, Textarea } from '../ui/Primitives';
import { optionalNullableIdSchema } from '../../utils/formHelpers';

const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    transaction_date: z.string().min(1, 'Tanggal wajib diisi'),
    account_id: z.coerce.number().min(1, 'Akun asal wajib dipilih'),
    to_account_id: optionalNullableIdSchema,
    category_id: optionalNullableIdSchema,
    amount: z.coerce.number().positive('Nominal harus lebih besar dari Rp0'),
    space: z.enum(['pribadi', 'keluarga', 'anak']),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'transfer') {
      if (!data.to_account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to_account_id'],
          message: 'Akun tujuan wajib dipilih untuk transfer',
        });
      } else if (data.to_account_id === data.account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to_account_id'],
          message: 'Akun tujuan tidak boleh sama dengan akun asal',
        });
      }
    } else if (!data.category_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category_id'],
        message: 'Kategori wajib dipilih',
      });
    }
  });

type TransactionFormValues = z.infer<typeof transactionSchema>;

export function TransactionModal({
  open,
  onClose,
  onSuccess,
  editingTransaction,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingTransaction?: Transaction | null;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [attachmentId, setAttachmentId] = useState<number | null>(null);
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof transactionSchema>, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'expense',
      transaction_date: getTodayISO(),
      account_id: 1,
      to_account_id: null,
      category_id: 8,
      amount: 0,
      space: 'keluarga',
      notes: '',
    },
  });

  const txType = watch('type');

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setIdempotencyKey(generateIdempotencyKey());

    Promise.all([accountsApi.list('all'), categoriesApi.list()]).then(([accs, cats]) => {
      const activeAccs = accs.filter((a) => a.is_active);
      setAccounts(activeAccs);
      setCategories(cats);

      if (editingTransaction) {
        reset({
          type: editingTransaction.type,
          transaction_date: editingTransaction.transaction_date,
          account_id: editingTransaction.account_id,
          to_account_id: editingTransaction.to_account_id,
          category_id: editingTransaction.category_id,
          amount: editingTransaction.amount,
          space: editingTransaction.space,
          notes: editingTransaction.notes || '',
        });
        setAttachmentId(editingTransaction.attachment?.id ?? null);
        setAttachmentName(editingTransaction.attachment?.file_name ?? '');
      } else {
        const defaultAcc = activeAccs[0]?.id ?? 1;
        const defaultExpCat = cats.find((c) => c.type === 'expense')?.id ?? 8;
        reset({
          type: 'expense',
          transaction_date: getTodayISO(),
          account_id: defaultAcc,
          to_account_id: activeAccs[1]?.id ?? null,
          category_id: defaultExpCat,
          amount: undefined as unknown as number,
          space: 'keluarga',
          notes: '',
        });
        setAttachmentId(null);
        setAttachmentName('');
      }
    });
  }, [open, editingTransaction, reset]);

  const filteredCategories = categories.filter((c) => c.type === txType);

  const handleTypeChange = (nextType: TransactionType) => {
    setValue('type', nextType);
    if (nextType === 'transfer') {
      setValue('category_id', null);
    } else {
      const firstMatch = categories.find((c) => c.type === nextType);
      setValue('category_id', firstMatch?.id ?? null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setSubmitError(null);
    try {
      const uploaded = await transactionsApi.uploadAttachment(file);
      setAttachmentId(uploaded.id);
      setAttachmentName(uploaded.file_name);
    } catch (err) {
      setSubmitError(extractApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: TransactionFormValues) => {
    setSubmitError(null);
    try {
      if (editingTransaction) {
        await transactionsApi.update(editingTransaction.id, {
          ...values,
          attachment_id: attachmentId,
        });
      } else {
        await transactionsApi.create({
          ...values,
          space: values.space as SpaceType,
          idempotency_key: idempotencyKey,
          attachment_id: attachmentId,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setSubmitError(extractApiError(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingTransaction ? 'Ubah Transaksi' : 'Catat Transaksi Baru'}
      description="Saldo akun diperbarui otomatis secara transaksional di server."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {submitError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {submitError}
          </div>
        )}

        <div>
          <span className="block text-xs font-medium text-slate-700 mb-1.5">Jenis Transaksi</span>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={`h-9 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  txType === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t === 'expense' ? 'Pengeluaran' : t === 'income' ? 'Pemasukan' : 'Transfer'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Tanggal Transaksi"
            type="date"
            error={errors.transaction_date?.message}
            {...register('transaction_date')}
          />
          <Input
            label="Nominal (Rp)"
            type="number"
            min={1}
            step="1"
            placeholder="Contoh: 150000"
            className="font-mono tabular-nums"
            error={errors.amount?.message}
            {...register('amount')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={txType === 'transfer' ? 'Akun Asal' : 'Akun Keuangan'}
            error={errors.account_id?.message}
            {...register('account_id')}
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatIDR(acc.current_balance)})
              </option>
            ))}
          </Select>

          {txType === 'transfer' ? (
            <Select
              label="Akun Tujuan"
              error={errors.to_account_id?.message}
              {...register('to_account_id')}
            >
              <option value="">Pilih akun tujuan</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatIDR(acc.current_balance)})
                </option>
              ))}
            </Select>
          ) : (
            <Select
              label="Kategori"
              error={errors.category_id?.message}
              {...register('category_id')}
            >
              <option value="">Pilih kategori</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <Select label="Ruang Keuangan" error={errors.space?.message} {...register('space')}>
          <option value="keluarga">Keluarga (Bersama)</option>
          <option value="pribadi">Pribadi (Privasi Terlindungi)</option>
          <option value="anak">Anak</option>
        </Select>

        <Textarea
          label="Catatan (Opsional)"
          rows={2}
          placeholder="Contoh: Belanja kebutuhan dapur mingguan"
          {...register('notes')}
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700">
            Bukti Transaksi (Opsional)
          </label>
          <label className="flex items-center justify-between px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-emerald-500 cursor-pointer transition-colors">
            <span className="flex items-center gap-2 truncate">
              {attachmentName ? (
                <>
                  <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-slate-900 font-medium truncate">{attachmentName}</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{uploading ? 'Mengunggah...' : 'Pilih gambar atau PDF struk'}</span>
                </>
              )}
            </span>
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="sr-only" />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting || uploading}>
            {isSubmitting
              ? 'Menyimpan...'
              : editingTransaction
              ? 'Simpan Perubahan'
              : 'Simpan Transaksi'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
