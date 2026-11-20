import React from 'react';
import { Lock, ShieldCheck, Users } from 'lucide-react';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Brand & Isolation Overview Panel */}
      <aside className="lg:col-span-5 bg-slate-900 text-slate-200 px-6 py-6 sm:px-10 lg:px-12 lg:py-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="space-y-4 lg:space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-display font-bold text-sm shrink-0">
              FF
            </div>
            <span className="font-display font-semibold text-white tracking-tight text-lg whitespace-nowrap">
              Family Finance
            </span>
          </div>

          <div className="hidden lg:block space-y-4 max-w-md">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
              Kelola Keuangan Pribadi & Keluarga Secara Terpisah dan Aman
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Setiap akun memiliki ruang keuangan sendiri. Data transaksi, rekening, anggaran, tabungan, dan investasi Anda terisolasi sepenuhnya dari pengguna lain.
            </p>
          </div>

          <div className="hidden lg:block space-y-4 pt-2 max-w-md border-t border-slate-800">
            <div className="flex items-start gap-3 pt-4">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Isolasi Multi-Akun</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Pengguna baru yang mendaftar langsung memulai dengan catatan bersih tanpa akses ke data akun lain.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Ruang Pribadi, Keluarga & Anak</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Undang pasangan atau anggota keluarga hanya ke ruang keluarga Anda sendiri dengan kontrol izin privasi.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Pelacakan Aset Menyeluruh</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Pantau arus kas bulanan hingga multi-tahun, anggaran, dana darurat, tagihan, dan portofolio investasi.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="hidden lg:block text-xs text-slate-500 pt-8">
          Family Finance · Sistem Manajemen Keuangan Pribadi & Rumah Tangga
        </p>
      </aside>

      {/* Right Auth Form Panel */}
      <main className="lg:col-span-7 flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{subtitle}</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
