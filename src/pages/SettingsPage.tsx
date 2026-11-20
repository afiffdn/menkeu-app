import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, CheckCircle2, Home, Plus, Trash2, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authApi, categoriesApi, extractApiError, familyApi } from '../services/api';
import type { Category } from '../types/finance';
import { computeProfileCompleteness } from '../utils/finance';
import { Button, Card, ErrorBanner, Input, Select, Textarea } from '../components/ui/Primitives';

const personalSchema = z.object({
  name: z.string().min(2, 'Nama lengkap minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().optional(),
  occupation: z.string().optional(),
  birth_date: z.string().optional(),
  address: z.string().optional(),
  currency: z.string().default('IDR'),
});

const familySchema = z.object({
  name: z.string().min(2, 'Nama keluarga minimal 2 karakter'),
  head_of_family: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

export function SettingsPage() {
  const { user, families, refreshProfile } = useAuth();
  const primaryFamily = families[0] ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [familyMsg, setFamilyMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completeness = computeProfileCompleteness(user, primaryFamily);

  const profileForm = useForm<z.input<typeof personalSchema>, unknown, z.output<typeof personalSchema>>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      occupation: user?.occupation || '',
      birth_date: user?.birth_date || '',
      address: user?.address || '',
      currency: user?.currency || 'IDR',
    },
  });

  const familyForm = useForm<z.input<typeof familySchema>, unknown, z.output<typeof familySchema>>({
    resolver: zodResolver(familySchema),
    defaultValues: {
      name: primaryFamily?.name || '',
      head_of_family: primaryFamily?.head_of_family || '',
      city: primaryFamily?.city || '',
      phone: primaryFamily?.phone || '',
      address: primaryFamily?.address || '',
      description: primaryFamily?.description || '',
    },
  });

  const catForm = useForm<{ name: string; type: 'income' | 'expense'; color: string }>({
    defaultValues: {
      name: '',
      type: 'expense',
      color: '#059669',
    },
  });

  const loadCategories = useCallback(async () => {
    try {
      const list = await categoriesApi.list();
      setCategories(list);
    } catch (err) {
      setError(extractApiError(err));
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (user) {
      profileForm.reset({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        occupation: user.occupation || '',
        birth_date: user.birth_date || '',
        address: user.address || '',
        currency: user.currency || 'IDR',
      });
    }
  }, [user, profileForm]);

  useEffect(() => {
    if (primaryFamily) {
      familyForm.reset({
        name: primaryFamily.name || '',
        head_of_family: primaryFamily.head_of_family || '',
        city: primaryFamily.city || '',
        phone: primaryFamily.phone || '',
        address: primaryFamily.address || '',
        description: primaryFamily.description || '',
      });
    }
  }, [primaryFamily, familyForm]);

  const handleSaveProfile = async (values: z.output<typeof personalSchema>) => {
    setError(null);
    setProfileMsg(null);
    try {
      await authApi.updateProfile({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone?.trim() || null,
        occupation: values.occupation?.trim() || null,
        birth_date: values.birth_date?.trim() || null,
        address: values.address?.trim() || null,
        currency: values.currency || 'IDR',
      });
      await refreshProfile();
      setProfileMsg('Data diri berhasil disimpan.');
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleSaveFamily = async (values: z.output<typeof familySchema>) => {
    setError(null);
    setFamilyMsg(null);
    try {
      const payload = {
        name: values.name.trim(),
        head_of_family: values.head_of_family?.trim() || null,
        city: values.city?.trim() || null,
        phone: values.phone?.trim() || null,
        address: values.address?.trim() || null,
        description: values.description?.trim() || undefined,
      };
      if (primaryFamily) {
        await familyApi.update(primaryFamily.id, payload);
        setFamilyMsg('Data profil keluarga berhasil diperbarui.');
      } else {
        await familyApi.create(payload);
        setFamilyMsg('Ruang keluarga baru berhasil dibuat.');
      }
      await refreshProfile();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleCreateCategory = async (values: { name: string; type: 'income' | 'expense'; color: string }) => {
    if (!values.name.trim()) return;
    setError(null);
    try {
      await categoriesApi.create(values);
      catForm.reset({ name: '', type: 'expense', color: '#059669' });
      await loadCategories();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await categoriesApi.remove(id);
      await loadCategories();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Profil, Keluarga & Pengaturan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Lengkapi data diri Anda, profil keluarga, serta kelola kategori transaksi kustom.
          </p>
        </div>
        <Link
          to="/family"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline shrink-0"
        >
          Kelola Anggota Keluarga <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Completeness Progress Bar */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                completeness.percentage === 100 ? 'text-emerald-600' : 'text-slate-400'
              }`}
            />
            <span className="text-sm font-semibold text-slate-900">
              Kelengkapan Data Diri & Keluarga
            </span>
          </div>
          <span className="text-xs font-semibold font-mono tabular-nums text-emerald-700">
            {completeness.filled} dari {completeness.total} data terisi ({completeness.percentage}%)
          </span>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 rounded-full transition-all duration-300"
            style={{ width: `${completeness.percentage}%` }}
          />
        </div>
        {completeness.missingLabels.length > 0 ? (
          <p className="text-xs text-slate-500 mt-2">
            Data yang belum dilengkapi: {completeness.missingLabels.join(', ')}.
          </p>
        ) : (
          <p className="text-xs text-emerald-700 mt-2 font-medium">
            Seluruh data diri dan profil keluarga telah lengkap terisi.
          </p>
        )}
      </Card>

      {/* Personal & Family Profile Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Profile Card */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Lengkapi Data Diri</h2>
              <p className="text-xs text-slate-500">Identitas pemilik akun utama pada ruang kerja ini.</p>
            </div>
          </div>

          {profileMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {profileMsg}
            </div>
          )}

          <form onSubmit={profileForm.handleSubmit(handleSaveProfile)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nama Lengkap"
                placeholder="Contoh: Andi Pratama"
                error={profileForm.formState.errors.name?.message}
                {...profileForm.register('name')}
              />
              <Input
                label="Alamat Email"
                type="email"
                placeholder="andi@familyfinance.id"
                error={profileForm.formState.errors.email?.message}
                {...profileForm.register('email')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nomor Telepon / WhatsApp"
                placeholder="Contoh: 081234567890"
                {...profileForm.register('phone')}
              />
              <Input
                label="Pekerjaan / Profesi"
                placeholder="Contoh: Software Engineer"
                {...profileForm.register('occupation')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Tanggal Lahir"
                type="date"
                {...profileForm.register('birth_date')}
              />
              <Select label="Mata Uang Utama" {...profileForm.register('currency')}>
                <option value="IDR">IDR — Rupiah Indonesia (Rp)</option>
              </Select>
            </div>

            <Textarea
              label="Alamat Domisili Pribadi"
              rows={2}
              placeholder="Contoh: Jl. Melati No. 12, Kec. Coblong"
              {...profileForm.register('address')}
            />

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="submit" size="sm" disabled={profileForm.formState.isSubmitting}>
                Simpan Data Diri
              </Button>
            </div>
          </form>
        </Card>

        {/* Family Profile Card */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Lengkapi Data Keluarga</h2>
              <p className="text-xs text-slate-500">
                Informasi identitas rumah tangga untuk ruang keuangan bersama.
              </p>
            </div>
          </div>

          {familyMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {familyMsg}
            </div>
          )}

          <form onSubmit={familyForm.handleSubmit(handleSaveFamily)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nama Keluarga"
                placeholder="Contoh: Keluarga Pratama"
                error={familyForm.formState.errors.name?.message}
                {...familyForm.register('name')}
              />
              <Input
                label="Nama Kepala Keluarga"
                placeholder="Contoh: Andi Pratama"
                {...familyForm.register('head_of_family')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Kota / Kabupaten Domisili"
                placeholder="Contoh: Kota Bandung"
                {...familyForm.register('city')}
              />
              <Input
                label="Nomor Telepon Rumah / Darurat"
                placeholder="Contoh: 0227788990"
                {...familyForm.register('phone')}
              />
            </div>

            <Textarea
              label="Alamat Lengkap Keluarga"
              rows={2}
              placeholder="Contoh: Jl. Melati No. 12, Kota Bandung, Jawa Barat"
              {...familyForm.register('address')}
            />

            <Textarea
              label="Catatan / Deskripsi Keluarga"
              rows={2}
              placeholder="Ruang keuangan bersama untuk kebutuhan rumah tangga dan pendidikan."
              {...familyForm.register('description')}
            />

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="submit" size="sm" disabled={familyForm.formState.isSubmitting}>
                {primaryFamily ? 'Simpan Data Keluarga' : 'Buat Profil Keluarga'}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Categories CRUD */}
      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Kategori Transaksi</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tambahkan kategori khusus di luar kategori standar sistem.
          </p>
        </div>

        <form
          onSubmit={catForm.handleSubmit(handleCreateCategory)}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div className="sm:col-span-2">
            <Input
              label="Nama Kategori Baru"
              placeholder="Contoh: Donasi / Zakat"
              {...catForm.register('name')}
            />
          </div>
          <Select label="Jenis" {...catForm.register('type')}>
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </Select>
          <Button type="submit" size="md">
            <Plus className="w-4 h-4" />
            Tambah
          </Button>
        </form>

        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: cat.color || '#64748b' }}
                />
                <span className="font-medium text-slate-900">{cat.name}</span>
                <span className="text-slate-400">·</span>
                <span className={cat.type === 'income' ? 'text-emerald-700' : 'text-red-600'}>
                  {cat.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                </span>
              </div>

              {cat.is_system ? (
                <span className="text-[11px] text-slate-400">Standar</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat.id)}
                  aria-label={`Hapus kategori ${cat.name}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
