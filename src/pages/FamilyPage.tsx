import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MapPin, Pencil, Phone, Shield, Trash2, User, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { extractApiError, familyApi } from '../services/api';
import type { Family, FamilyMember, FamilyRole } from '../types/finance';
import { formatDateID, getRoleLabel } from '../utils/finance';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Select,
  Textarea,
} from '../components/ui/Primitives';

const familySchema = z.object({
  name: z.string().min(2, 'Nama keluarga minimal 2 karakter'),
  head_of_family: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

const inviteSchema = z.object({
  name: z.string().min(2, 'Nama anggota wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  relationship: z.string().optional(),
  role: z.enum(['admin', 'member', 'viewer']),
  can_view_private: z.boolean().default(false),
});

export function FamilyPage() {
  const { user, refreshProfile } = useAuth();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const createForm = useForm<z.input<typeof familySchema>, unknown, z.output<typeof familySchema>>({
    resolver: zodResolver(familySchema),
    defaultValues: { name: '', head_of_family: '', city: '', phone: '', address: '', description: '' },
  });

  const editForm = useForm<z.input<typeof familySchema>, unknown, z.output<typeof familySchema>>({
    resolver: zodResolver(familySchema),
    defaultValues: { name: '', head_of_family: '', city: '', phone: '', address: '', description: '' },
  });

  const inviteForm = useForm<z.input<typeof inviteSchema>, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', email: '', relationship: '', role: 'member', can_view_private: false },
  });

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await familyApi.list();
      setFamilies(list);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  const primaryFamily = families[0] ?? null;
  const currentMembership = primaryFamily?.members.find((m) => m.user_id === user?.id);
  const canManage = currentMembership?.role === 'owner' || currentMembership?.role === 'admin';

  const openEditFamilyModal = () => {
    if (!primaryFamily) return;
    editForm.reset({
      name: primaryFamily.name || '',
      head_of_family: primaryFamily.head_of_family || '',
      city: primaryFamily.city || '',
      phone: primaryFamily.phone || '',
      address: primaryFamily.address || '',
      description: primaryFamily.description || '',
    });
    setEditOpen(true);
  };

  const handleCreateFamily = async (values: z.output<typeof familySchema>) => {
    try {
      await familyApi.create({
        name: values.name.trim(),
        head_of_family: values.head_of_family?.trim() || null,
        city: values.city?.trim() || null,
        phone: values.phone?.trim() || null,
        address: values.address?.trim() || null,
        description: values.description?.trim() || undefined,
      });
      setCreateOpen(false);
      createForm.reset();
      await refreshProfile();
      await loadFamilies();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleEditFamily = async (values: z.output<typeof familySchema>) => {
    if (!primaryFamily) return;
    try {
      await familyApi.update(primaryFamily.id, {
        name: values.name.trim(),
        head_of_family: values.head_of_family?.trim() || null,
        city: values.city?.trim() || null,
        phone: values.phone?.trim() || null,
        address: values.address?.trim() || null,
        description: values.description?.trim() || null,
      });
      setEditOpen(false);
      await refreshProfile();
      await loadFamilies();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleInvite = async (values: z.output<typeof inviteSchema>) => {
    if (!primaryFamily) return;
    try {
      await familyApi.inviteMember(primaryFamily.id, {
        ...values,
        relationship: values.relationship?.trim() || null,
      });
      setInviteOpen(false);
      inviteForm.reset();
      await refreshProfile();
      await loadFamilies();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleUpdateRole = async (member: FamilyMember, role: FamilyRole) => {
    if (!primaryFamily) return;
    try {
      await familyApi.updateMember(primaryFamily.id, member.id, { role });
      await loadFamilies();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleTogglePrivate = async (member: FamilyMember) => {
    if (!primaryFamily) return;
    try {
      await familyApi.updateMember(primaryFamily.id, member.id, {
        can_view_private: !member.can_view_private,
      });
      await loadFamilies();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleRemoveMember = async (member: FamilyMember) => {
    if (!primaryFamily) return;
    try {
      await familyApi.removeMember(primaryFamily.id, member.id);
      await loadFamilies();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Anggota Keluarga & Profil Keluarga
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola data identitas keluarga, anggota rumah tangga, dan pembagian hak akses ruang keuangan.
          </p>
        </div>

        {primaryFamily ? (
          canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={openEditFamilyModal}>
                <Pencil className="w-3.5 h-3.5" />
                Edit Profil Keluarga
              </Button>
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="w-4 h-4" />
                Undang Anggota
              </Button>
            </div>
          )
        ) : (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Users className="w-4 h-4" />
            Buat Ruang Keluarga
          </Button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadFamilies} />}

      {loading ? (
        <Card className="p-8 text-center text-xs text-slate-500">Memuat data keluarga...</Card>
      ) : !primaryFamily ? (
        <Card>
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            title="Belum ada profil keluarga"
            description="Buat ruang keluarga untuk melengkapi identitas rumah tangga dan mencatat keuangan bersama."
            actionLabel="Buat Keluarga Sekarang"
            onAction={() => setCreateOpen(true)}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{primaryFamily.name}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {primaryFamily.description || 'Ruang keuangan keluarga'} · Dibuat{' '}
                  {formatDateID(primaryFamily.created_at)}
                </p>
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-2 shrink-0">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>
                  Peran Anda:{' '}
                  <strong className="text-slate-900">
                    {getRoleLabel(currentMembership?.role || 'member')}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
              <div className="flex items-start gap-2.5">
                <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-slate-400">Kepala Keluarga</p>
                  <p className="font-medium text-slate-900 mt-0.5 truncate">
                    {primaryFamily.head_of_family || 'Belum dilengkapi'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-slate-400">Kota Domisili</p>
                  <p className="font-medium text-slate-900 mt-0.5 truncate">
                    {primaryFamily.city || 'Belum dilengkapi'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-slate-400">Telepon Keluarga</p>
                  <p className="font-medium text-slate-900 font-mono tabular-nums mt-0.5 truncate">
                    {primaryFamily.phone || 'Belum dilengkapi'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-slate-400">Alamat Rumah</p>
                  <p className="font-medium text-slate-900 mt-0.5 line-clamp-2">
                    {primaryFamily.address || 'Belum dilengkapi'}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Daftar Anggota ({primaryFamily.members.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {primaryFamily.members.map((m) => (
                <div
                  key={m.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {m.avatar_url ? (
                      <img
                        src={m.avatar_url}
                        alt={m.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {m.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {m.name} {m.user_id === user?.id ? '(Anda)' : ''}
                        {m.relationship ? (
                          <span className="font-normal text-slate-500"> · {m.relationship}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {m.email} · Bergabung {formatDateID(m.joined_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {canManage && m.role !== 'owner' ? (
                      <>
                        <select
                          aria-label={`Ubah role ${m.name}`}
                          value={m.role}
                          onChange={(e) => handleUpdateRole(m, e.target.value as FamilyRole)}
                          className="h-8 px-2.5 text-xs font-medium bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleTogglePrivate(m)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                        >
                          {m.can_view_private ? 'Cabut Akses Pribadi' : 'Privasi Ketat'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m)}
                          aria-label={`Hapus ${m.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-slate-700">
                        {getRoleLabel(m.role)} ·{' '}
                        {m.can_view_private ? 'Akses Pribadi Aktif' : 'Data Pribadi Terisolasi'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Matriks Hak Akses Role</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="font-semibold text-slate-900">Owner</p>
                <p className="text-slate-500 mt-1">
                  Pemilik keluarga, kelola anggota, role, dan seluruh data keluarga.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Admin</p>
                <p className="text-slate-500 mt-1">
                  Mengelola akun bersama, anggaran, tagihan, dan anggota non-owner.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Member</p>
                <p className="text-slate-500 mt-1">
                  Mencatat transaksi, melihat ruang keluarga/anak, dan menjaga privasi ruang pribadi.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Viewer</p>
                <p className="text-slate-500 mt-1">
                  Hanya dapat melihat data bersama yang diizinkan tanpa mengubah catatan.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Create Family Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Buat Ruang Keluarga Baru">
        <form onSubmit={createForm.handleSubmit(handleCreateFamily)} className="space-y-4">
          <Input
            label="Nama Keluarga"
            placeholder="Contoh: Keluarga Pratama"
            error={createForm.formState.errors.name?.message}
            {...createForm.register('name')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Kepala Keluarga"
              placeholder="Contoh: Andi Pratama"
              {...createForm.register('head_of_family')}
            />
            <Input label="Kota Domisili" placeholder="Contoh: Bandung" {...createForm.register('city')} />
          </div>
          <Input label="Nomor Telepon" placeholder="Contoh: 0227788990" {...createForm.register('phone')} />
          <Textarea label="Alamat Rumah" rows={2} {...createForm.register('address')} />
          <Textarea label="Deskripsi Singkat" rows={2} {...createForm.register('description')} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createForm.formState.isSubmitting}>
              Buat Keluarga
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Family Profile Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Lengkapi & Edit Profil Keluarga">
        <form onSubmit={editForm.handleSubmit(handleEditFamily)} className="space-y-4">
          <Input
            label="Nama Keluarga"
            placeholder="Contoh: Keluarga Pratama"
            error={editForm.formState.errors.name?.message}
            {...editForm.register('name')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Kepala Keluarga"
              placeholder="Contoh: Andi Pratama"
              {...editForm.register('head_of_family')}
            />
            <Input label="Kota Domisili" placeholder="Contoh: Bandung" {...editForm.register('city')} />
          </div>
          <Input label="Telepon Keluarga" placeholder="Contoh: 0227788990" {...editForm.register('phone')} />
          <Textarea label="Alamat Lengkap" rows={2} {...editForm.register('address')} />
          <Textarea label="Deskripsi Keluarga" rows={2} {...editForm.register('description')} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={editForm.formState.isSubmitting}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Invite Member Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Undang Anggota Keluarga">
        <form onSubmit={inviteForm.handleSubmit(handleInvite)} className="space-y-4">
          <Input
            label="Nama Lengkap"
            placeholder="Contoh: Nadia Pratama"
            error={inviteForm.formState.errors.name?.message}
            {...inviteForm.register('name')}
          />
          <Input
            label="Alamat Email"
            type="email"
            placeholder="nadia@familyfinance.id"
            error={inviteForm.formState.errors.email?.message}
            {...inviteForm.register('email')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Hubungan Keluarga"
              placeholder="Contoh: Pasangan / Anak / Orang Tua"
              {...inviteForm.register('relationship')}
            />
            <Select label="Role Akses" {...inviteForm.register('role')}>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={inviteForm.formState.isSubmitting}>
              Tambah Anggota
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
