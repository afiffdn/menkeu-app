import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { extractApiError } from '../services/api';
import { buildRegisterPayload, registerSchema, type RegisterFormValues } from '../utils/authSchemas';
import { AuthShell } from '../components/auth/AuthShell';
import { Button, ErrorBanner, Input } from '../components/ui/Primitives';

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      family_name: '',
      password: '',
      confirm_password: '',
    },
  });

  const handleSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      await registerAccount(buildRegisterPayload(values));
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err));
    }
  };

  return (
    <AuthShell
      title="Daftar Akun Baru"
      subtitle="Buat akun Anda sendiri. Data transaksi, rekening, dan anggaran Anda terisolasi sepenuhnya dari pengguna lain."
    >
      {serverError && <ErrorBanner message={serverError} />}

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
        <Input
          id="register-name"
          label="Nama Lengkap"
          type="text"
          autoComplete="name"
          placeholder="Contoh: Budi Santoso"
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />

        <Input
          id="register-email"
          label="Alamat Email"
          type="email"
          autoComplete="email"
          placeholder="budi@email.com"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />

        <div className="space-y-1">
          <Input
            id="register-family-name"
            label="Nama Keluarga / Ruang Bersama (Opsional)"
            type="text"
            placeholder="Contoh: Keluarga Santoso"
            error={form.formState.errors.family_name?.message}
            {...form.register('family_name')}
          />
          <p className="text-[11px] text-slate-500">
            Isi jika ingin membuat ruang keuangan keluarga baru, atau kosongkan untuk penggunaan pribadi saja.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-password" className="block text-xs font-medium text-slate-700">
            Kata Sandi
          </label>
          <div className="relative">
            <input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              className={`w-full h-10 pl-3 pr-10 text-sm bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 ${
                form.formState.errors.password ? 'border-red-500' : 'border-slate-200'
              }`}
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-confirm-password" className="block text-xs font-medium text-slate-700">
            Konfirmasi Kata Sandi
          </label>
          <div className="relative">
            <input
              id="register-confirm-password"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Ulangi kata sandi"
              className={`w-full h-10 pl-3 pr-10 text-sm bg-white border rounded-lg text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 ${
                form.formState.errors.confirm_password ? 'border-red-500' : 'border-slate-200'
              }`}
              {...form.register('confirm_password')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((prev) => !prev)}
              aria-label={showConfirm ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.formState.errors.confirm_password && (
            <p className="text-xs text-red-600">{form.formState.errors.confirm_password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          <UserPlus className="w-4 h-4" />
          {form.formState.isSubmitting ? 'Mendaftarkan Akun...' : 'Daftar & Buat Akun'}
        </Button>
      </form>

      <div className="pt-5 border-t border-slate-200 text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Sudah punya akun? Masuk di sini
        </Link>
      </div>
    </AuthShell>
  );
}
