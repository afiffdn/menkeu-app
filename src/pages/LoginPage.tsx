import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { extractApiError } from '../services/api';
import { loginSchema, type LoginFormValues } from '../utils/authSchemas';
import { AuthShell } from '../components/auth/AuthShell';
import { Button, ErrorBanner, Input } from '../components/ui/Primitives';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err));
    }
  };

  return (
    <AuthShell
      title="Masuk ke Akun Anda"
      subtitle="Masukkan email dan kata sandi untuk membuka ruang keuangan pribadi dan keluarga Anda."
    >
      {serverError && <ErrorBanner message={serverError} />}

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
        <Input
          id="login-email"
          label="Alamat Email"
          type="email"
          autoComplete="email"
          placeholder="nama@email.com"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />

        <div className="space-y-1.5">
          <label htmlFor="login-password" className="block text-xs font-medium text-slate-700">
            Kata Sandi
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
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

        <Button
          type="submit"
          size="lg"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          <LogIn className="w-4 h-4" />
          {form.formState.isSubmitting ? 'Memproses...' : 'Masuk'}
        </Button>
      </form>

      <div className="pt-5 border-t border-slate-200 space-y-3">
        <p className="text-xs text-slate-500 text-center">
          Belum punya akun? Buat akun terpisah agar data keuangan Anda hanya bisa diakses oleh Anda.
        </p>
        <Link
          to="/register"
          className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4 text-emerald-700" />
          Daftar Akun Baru
        </Link>
      </div>
    </AuthShell>
  );
}
