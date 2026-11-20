import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  addEmergencyFundTransaction,
  addSavingsContribution,
  assertCanManageFamily,
  canViewRecord,
  canWriteRecord,
  computeAvailableYears,
  computeBudgets,
  computeCashFlowSeries,
  computeDashboardSummary,
  computeExpenseCategories,
  computeMultiYearSummary,
  createTransaction,
  deleteTransaction,
  DomainError,
  filterTransactions,
  generateAuthToken,
  getUserFamilyIds,
  getUserFamilyMembership,
  hydrateAccount,
  hydrateBill,
  hydrateEmergencyFund,
  hydrateFamily,
  hydrateInvestment,
  hydrateSavingsGoal,
  hydrateTransaction,
  nextId,
  payBill,
  recalculateAccountBalance,
  updateTransaction,
} from './server/ledger';
import { hashPassword, verifyPassword } from './server/seed';
import { getDbState, mutateDb } from './server/store';
import type { DashboardFilters, FamilyRole, SpaceType } from './src/types/finance';

interface AuthedRequest extends Request {
  userId?: number;
  authToken?: string;
}

const RATE_LIMIT_MAP = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = RATE_LIMIT_MAP.get(key);
    if (!entry || entry.resetAt < now) {
      RATE_LIMIT_MAP.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
      });
    }
    entry.count += 1;
    return next();
  };
}

function sendSuccess<T>(res: Response, message: string, data: T, status = 200, meta?: unknown) {
  return res.status(status).json(
    meta ? { success: true, message, data, meta } : { success: true, message, data }
  );
}

function sendError(res: Response, message: string, status = 400, errors?: Record<string, string[]>) {
  return res.status(status).json(errors ? { success: false, message, errors } : { success: false, message });
}

function serializeUser(user: import('./server/types').UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    occupation: user.occupation ?? null,
    birth_date: user.birth_date ?? null,
    address: user.address ?? null,
    avatar_url: user.avatar_url,
    currency: user.currency,
    created_at: user.created_at,
  };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : null;
  const rawToken = header?.startsWith('Bearer ') ? header.slice(7).trim() : tokenFromQuery;

  const state = getDbState();

  if (!rawToken) {
    const primaryUser = state.users[0];
    if (!primaryUser) {
      return sendError(res, 'Profil pengguna utama belum tersedia.', 404);
    }
    req.userId = primaryUser.id;
    return next();
  }

  const tokenRow = state.tokens.find((t) => t.token === rawToken);
  if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return sendError(res, 'Sesi berakhir atau token tidak valid.', 401);
  }

  req.userId = tokenRow.user_id;
  req.authToken = rawToken;
  return next();
}

function formatLocalDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNowTodayISO(): string {
  return formatLocalDateISO(new Date());
}

function getNowFutureDateISO(daysFromNow: number): string {
  const now = new Date();
  return formatLocalDateISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromNow));
}

function parseFilters(query: Request['query']): DashboardFilters {
  const now = new Date();
  const month = Number(query.month) || now.getMonth() + 1;
  const year = Number(query.year) || now.getFullYear();
  const space = typeof query.space === 'string' && ['pribadi', 'keluarga', 'anak', 'all'].includes(query.space)
    ? (query.space as SpaceType | 'all')
    : 'all';
  const member_id = query.member_id && query.member_id !== 'all' ? Number(query.member_id) : 'all';
  const account_id = query.account_id && query.account_id !== 'all' ? Number(query.account_id) : 'all';

  return { month, year, space, member_id, account_id };
}

function buildCsvContent(rows: Array<Record<string, string | number | null | undefined>>, headers: string[]): string {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

function buildExcelHtml(title: string, rows: Array<Record<string, string | number | null | undefined>>, headers: string[]): string {
  const th = headers.map((h) => `<th style="background:#0f172a;color:#fff;padding:6px 10px;border:1px solid #cbd5e1;">${h}</th>`).join('');
  const tr = rows
    .map(
      (r) =>
        `<tr>${headers
          .map((h) => `<td style="padding:6px 10px;border:1px solid #e2e8f0;">${String(r[h] ?? '')}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body><h3>${title}</h3><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
}

async function bootstrapServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', (_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  const api = express.Router();

  // ---------------- AUTH ----------------
  api.post('/auth/register', rateLimit(20, 60_000), (req, res) => {
    const { name, email, password, family_name } = req.body ?? {};
    const errors: Record<string, string[]> = {};
    if (!name || String(name).trim().length < 2) errors.name = ['Nama lengkap minimal 2 karakter.'];
    if (!email || !String(email).includes('@')) errors.email = ['Format email tidak valid.'];
    if (!password || String(password).length < 6) errors.password = ['Kata sandi minimal 6 karakter.'];
    if (Object.keys(errors).length > 0) return sendError(res, 'Validasi gagal', 422, errors);

    try {
      const result = mutateDb((state) => {
        const normalizedEmail = String(email).trim().toLowerCase();
        if (state.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          throw new DomainError('Email sudah terdaftar.', 422, { email: ['Email ini sudah digunakan.'] });
        }

        const now = new Date().toISOString();
        const userId = nextId(state, 'users');
        const user = {
          id: userId,
          name: String(name).trim(),
          email: normalizedEmail,
          password_hash: hashPassword(String(password)),
          avatar_url: null,
          currency: 'IDR',
          created_at: now,
        };
        state.users.push(user);

        // Create default family & starter account if requested
        if (family_name) {
          const familyId = nextId(state, 'families');
          state.families.push({
            id: familyId,
            name: String(family_name).trim(),
            owner_id: userId,
            description: 'Keluarga utama',
            created_at: now,
          });
          state.family_members.push({
            id: nextId(state, 'family_members'),
            family_id: familyId,
            user_id: userId,
            role: 'owner',
            can_view_private: false,
            joined_at: now,
          });
        }

        const token = generateAuthToken();
        state.tokens.push({
          token,
          user_id: userId,
          device_name: 'web-dashboard',
          created_at: now,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

        return {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url,
            currency: user.currency,
            created_at: user.created_at,
          },
        };
      });

      return sendSuccess(res, 'Registrasi berhasil', result, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal melakukan registrasi.', 500);
    }
  });

  api.post('/auth/login', rateLimit(30, 60_000), (req, res) => {
    const { email, password, device_name } = req.body ?? {};
    if (!email || !password) {
      return sendError(res, 'Validasi gagal', 422, {
        email: !email ? ['Email wajib diisi.'] : [],
        password: !password ? ['Kata sandi wajib diisi.'] : [],
      });
    }

    const result = mutateDb((state) => {
      const normalizedEmail = String(email).trim().toLowerCase();
      const user = state.users.find((u) => u.email.toLowerCase() === normalizedEmail);
      if (!user || !verifyPassword(String(password), user.password_hash)) {
        return null;
      }
      const now = new Date().toISOString();
      const token = generateAuthToken();
      state.tokens.push({
        token,
        user_id: user.id,
        device_name: device_name || 'web-dashboard',
        created_at: now,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          currency: user.currency,
          created_at: user.created_at,
        },
      };
    });

    if (!result) {
      return sendError(res, 'Email atau kata sandi salah.', 401);
    }
    return sendSuccess(res, 'Login berhasil', result);
  });

  api.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    mutateDb((state) => {
      state.tokens = state.tokens.filter((t) => t.token !== req.authToken);
    });
    return sendSuccess(res, 'Logout berhasil', null);
  });

  api.post('/auth/refresh', requireAuth, (req: AuthedRequest, res) => {
    const newToken = mutateDb((state) => {
      state.tokens = state.tokens.filter((t) => t.token !== req.authToken);
      const token = generateAuthToken();
      state.tokens.push({
        token,
        user_id: req.userId!,
        device_name: 'web-dashboard',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return token;
    });
    return sendSuccess(res, 'Token berhasil diperbarui', { token: newToken });
  });

  api.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const user = state.users.find((u) => u.id === req.userId);
    if (!user) return sendError(res, 'Pengguna tidak ditemukan.', 404);
    const memberships = state.family_members.filter((m) => m.user_id === user.id);
    const families = memberships.map((m) => hydrateFamily(state, m.family_id)).filter(Boolean);
    return sendSuccess(res, 'Profil pengguna berhasil dimuat', {
      user: serializeUser(user),
      families,
    });
  });

  api.put('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const { name, email, phone, occupation, birth_date, address, currency } = req.body ?? {};
    const errors: Record<string, string[]> = {};
    if (name !== undefined && String(name).trim().length < 2) {
      errors.name = ['Nama lengkap minimal 2 karakter.'];
    }
    if (email !== undefined && String(email).trim() !== '' && !String(email).includes('@')) {
      errors.email = ['Format email tidak valid.'];
    }
    if (Object.keys(errors).length > 0) {
      return sendError(res, 'Validasi gagal', 422, errors);
    }

    try {
      const updated = mutateDb((state) => {
        const user = state.users.find((u) => u.id === req.userId);
        if (!user) throw new DomainError('Pengguna tidak ditemukan.', 404);

        if (email !== undefined && String(email).trim() !== '') {
          const normalizedEmail = String(email).trim().toLowerCase();
          const duplicate = state.users.some(
            (u) => u.id !== user.id && u.email.toLowerCase() === normalizedEmail
          );
          if (duplicate) {
            throw new DomainError('Email sudah digunakan pengguna lain.', 422, {
              email: ['Email ini sudah terdaftar.'],
            });
          }
          user.email = normalizedEmail;
        }
        if (name !== undefined && String(name).trim().length >= 2) user.name = String(name).trim();
        if (phone !== undefined) user.phone = phone ? String(phone).trim() : null;
        if (occupation !== undefined) user.occupation = occupation ? String(occupation).trim() : null;
        if (birth_date !== undefined) user.birth_date = birth_date ? String(birth_date).trim() : null;
        if (address !== undefined) user.address = address ? String(address).trim() : null;
        if (currency) user.currency = String(currency).trim();

        return serializeUser(user);
      });
      return sendSuccess(res, 'Profil berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal memperbarui profil.', 500);
    }
  });

  // ---------------- DASHBOARD ----------------
  api.get('/dashboard/summary', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const summary = computeDashboardSummary(state, req.userId!, filters);
    return sendSuccess(res, 'Ringkasan dashboard berhasil dimuat', summary);
  });

  api.get('/dashboard/cash-flow', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const months = Number(req.query.months) || 6;
    const data = computeCashFlowSeries(state, req.userId!, filters, months);
    return sendSuccess(res, 'Grafik arus kas berhasil dimuat', data);
  });

  api.get('/dashboard/expense-categories', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const data = computeExpenseCategories(state, req.userId!, filters);
    return sendSuccess(res, 'Kategori pengeluaran berhasil dimuat', data);
  });

  api.get('/dashboard/recent-transactions', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const txs = filterTransactions(state, req.userId!, filters)
      .slice(0, 8)
      .map((t) => hydrateTransaction(state, t));
    return sendSuccess(res, 'Transaksi terbaru berhasil dimuat', txs);
  });

  // ---------------- FAMILIES ----------------
  api.get('/families', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const famIds = getUserFamilyIds(state, req.userId!);
    const families = famIds.map((id) => hydrateFamily(state, id)).filter(Boolean);
    return sendSuccess(res, 'Daftar keluarga berhasil dimuat', families);
  });

  api.post('/families', requireAuth, (req: AuthedRequest, res) => {
    const { name, description, head_of_family, city, address, phone } = req.body ?? {};
    if (!name || String(name).trim().length < 2) {
      return sendError(res, 'Validasi gagal', 422, { name: ['Nama keluarga minimal 2 karakter.'] });
    }
    const family = mutateDb((state) => {
      const now = new Date().toISOString();
      const id = nextId(state, 'families');
      state.families.push({
        id,
        name: String(name).trim(),
        owner_id: req.userId!,
        description: description ? String(description).trim() : null,
        head_of_family: head_of_family ? String(head_of_family).trim() : null,
        city: city ? String(city).trim() : null,
        address: address ? String(address).trim() : null,
        phone: phone ? String(phone).trim() : null,
        created_at: now,
      });
      state.family_members.push({
        id: nextId(state, 'family_members'),
        family_id: id,
        user_id: req.userId!,
        role: 'owner',
        relationship: 'Kepala Keluarga',
        can_view_private: false,
        joined_at: now,
      });
      return hydrateFamily(state, id);
    });
    return sendSuccess(res, 'Keluarga berhasil dibuat', family, 201);
  });

  api.get('/families/:id', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const familyId = Number(req.params.id);
    const membership = getUserFamilyMembership(state, req.userId!, familyId);
    if (!membership) return sendError(res, 'Anda tidak memiliki akses ke keluarga ini.', 403);
    const fam = hydrateFamily(state, familyId);
    if (!fam) return sendError(res, 'Keluarga tidak ditemukan.', 404);
    return sendSuccess(res, 'Detail keluarga berhasil dimuat', fam);
  });

  api.put('/families/:id', requireAuth, (req: AuthedRequest, res) => {
    const familyId = Number(req.params.id);
    const { name, description, head_of_family, city, address, phone } = req.body ?? {};
    if (name !== undefined && String(name).trim().length < 2) {
      return sendError(res, 'Validasi gagal', 422, { name: ['Nama keluarga minimal 2 karakter.'] });
    }
    try {
      const fam = mutateDb((state) => {
        assertCanManageFamily(state, req.userId!, familyId, ['owner', 'admin']);
        const target = state.families.find((f) => f.id === familyId);
        if (!target) throw new DomainError('Keluarga tidak ditemukan.', 404);
        if (name) target.name = String(name).trim();
        if (description !== undefined) target.description = description ? String(description).trim() : null;
        if (head_of_family !== undefined) target.head_of_family = head_of_family ? String(head_of_family).trim() : null;
        if (city !== undefined) target.city = city ? String(city).trim() : null;
        if (address !== undefined) target.address = address ? String(address).trim() : null;
        if (phone !== undefined) target.phone = phone ? String(phone).trim() : null;
        return hydrateFamily(state, familyId);
      });
      return sendSuccess(res, 'Profil keluarga berhasil diperbarui', fam);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal memperbarui profil keluarga.', 500);
    }
  });

  api.post('/families/:id/members', requireAuth, (req: AuthedRequest, res) => {
    const familyId = Number(req.params.id);
    const { name, email, role, relationship, can_view_private } = req.body ?? {};
    if (!email || !String(email).includes('@')) {
      return sendError(res, 'Validasi gagal', 422, { email: ['Email anggota wajib valid.'] });
    }
    const validRoles: FamilyRole[] = ['admin', 'member', 'viewer'];
    const targetRole: FamilyRole = validRoles.includes(role) ? role : 'member';

    try {
      const fam = mutateDb((state) => {
        assertCanManageFamily(state, req.userId!, familyId, ['owner', 'admin']);
        const normalizedEmail = String(email).trim().toLowerCase();
        let targetUser = state.users.find((u) => u.email.toLowerCase() === normalizedEmail);
        const now = new Date().toISOString();
        if (!targetUser) {
          targetUser = {
            id: nextId(state, 'users'),
            name: String(name || normalizedEmail.split('@')[0]).trim(),
            email: normalizedEmail,
            password_hash: hashPassword('Demo1234!'),
            phone: null,
            occupation: null,
            birth_date: null,
            address: null,
            avatar_url: null,
            currency: 'IDR',
            created_at: now,
          };
          state.users.push(targetUser);
        }
        if (state.family_members.some((m) => m.family_id === familyId && m.user_id === targetUser!.id)) {
          throw new DomainError('Pengguna sudah menjadi anggota keluarga ini.', 422, {
            email: ['Anggota sudah terdaftar di keluarga ini.'],
          });
        }
        state.family_members.push({
          id: nextId(state, 'family_members'),
          family_id: familyId,
          user_id: targetUser.id,
          role: targetRole,
          relationship: relationship ? String(relationship).trim() : null,
          can_view_private: Boolean(can_view_private),
          joined_at: now,
        });
        return hydrateFamily(state, familyId);
      });
      return sendSuccess(res, 'Anggota keluarga berhasil ditambahkan', fam, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal menambahkan anggota.', 500);
    }
  });

  api.patch('/families/:id/members/:memberId', requireAuth, (req: AuthedRequest, res) => {
    const familyId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const { role, relationship, can_view_private } = req.body ?? {};
    try {
      const fam = mutateDb((state) => {
        assertCanManageFamily(state, req.userId!, familyId, ['owner', 'admin']);
        const member = state.family_members.find((m) => m.id === memberId && m.family_id === familyId);
        if (!member) throw new DomainError('Anggota tidak ditemukan.', 404);
        if (member.role === 'owner' && role && role !== 'owner') {
          throw new DomainError('Role Owner tidak dapat diturunkan.', 422);
        }
        if (role && ['admin', 'member', 'viewer'].includes(role)) {
          member.role = role;
        }
        if (relationship !== undefined) {
          member.relationship = relationship ? String(relationship).trim() : null;
        }
        if (typeof can_view_private === 'boolean') {
          member.can_view_private = can_view_private;
        }
        return hydrateFamily(state, familyId);
      });
      return sendSuccess(res, 'Izin anggota berhasil diperbarui', fam);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal memperbarui anggota.', 500);
    }
  });

  api.delete('/families/:id/members/:memberId', requireAuth, (req: AuthedRequest, res) => {
    const familyId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    try {
      const fam = mutateDb((state) => {
        assertCanManageFamily(state, req.userId!, familyId, ['owner', 'admin']);
        const member = state.family_members.find((m) => m.id === memberId && m.family_id === familyId);
        if (!member) throw new DomainError('Anggota tidak ditemukan.', 404);
        if (member.role === 'owner') throw new DomainError('Pemilik keluarga tidak dapat dihapus.', 422);
        state.family_members = state.family_members.filter((m) => m.id !== memberId);
        return hydrateFamily(state, familyId);
      });
      return sendSuccess(res, 'Anggota keluarga berhasil dihapus', fam);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal menghapus anggota.', 500);
    }
  });

  // ---------------- ACCOUNTS ----------------
  api.get('/accounts', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const space = typeof req.query.space === 'string' ? req.query.space : 'all';
    const accounts = state.accounts
      .filter((a) => !a.deleted_at)
      .filter((a) => canViewRecord(state, req.userId!, a))
      .filter((a) => space === 'all' || a.space === space)
      .map((a) => hydrateAccount(state, a));
    return sendSuccess(res, 'Daftar akun keuangan berhasil dimuat', accounts);
  });

  api.post('/accounts', requireAuth, (req: AuthedRequest, res) => {
    const { name, type, initial_balance, space, description, is_active } = req.body ?? {};
    const errors: Record<string, string[]> = {};
    if (!name || String(name).trim().length < 2) errors.name = ['Nama akun minimal 2 karakter.'];
    if (!type) errors.type = ['Jenis akun wajib dipilih.'];
    if (Number(initial_balance) < 0 || Number.isNaN(Number(initial_balance))) {
      errors.initial_balance = ['Saldo awal tidak boleh negatif.'];
    }
    if (Object.keys(errors).length > 0) return sendError(res, 'Validasi gagal', 422, errors);

    const account = mutateDb((state) => {
      const now = new Date().toISOString();
      const id = nextId(state, 'accounts');
      const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
      const rec = {
        id,
        user_id: req.userId!,
        family_id: famId,
        name: String(name).trim(),
        type,
        initial_balance: Number(initial_balance) || 0,
        current_balance: Number(initial_balance) || 0,
        currency: 'IDR',
        space: (space || 'pribadi') as SpaceType,
        description: description?.trim() || null,
        is_active: is_active !== false,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      };
      state.accounts.push(rec);
      return hydrateAccount(state, rec);
    });

    return sendSuccess(res, 'Akun keuangan berhasil ditambahkan', account, 201);
  });

  api.get('/accounts/:id', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const acc = state.accounts.find((a) => a.id === Number(req.params.id) && !a.deleted_at);
    if (!acc) return sendError(res, 'Akun tidak ditemukan.', 404);
    if (!canViewRecord(state, req.userId!, acc)) return sendError(res, 'Akses ditolak.', 403);
    return sendSuccess(res, 'Detail akun berhasil dimuat', hydrateAccount(state, acc));
  });

  api.put('/accounts/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { name, type, space, description, is_active, initial_balance } = req.body ?? {};
    try {
      const updated = mutateDb((state) => {
        const acc = state.accounts.find((a) => a.id === id && !a.deleted_at);
        if (!acc) throw new DomainError('Akun tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, acc)) throw new DomainError('Akses ditolak.', 403);
        if (name) acc.name = String(name).trim();
        if (type) acc.type = type;
        if (space) acc.space = space;
        if (description !== undefined) acc.description = description?.trim() || null;
        if (typeof is_active === 'boolean') acc.is_active = is_active;
        if (initial_balance !== undefined) acc.initial_balance = Number(initial_balance);
        acc.updated_at = new Date().toISOString();
        recalculateAccountBalance(state, acc.id);
        return hydrateAccount(state, acc);
      });
      return sendSuccess(res, 'Akun berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal memperbarui akun.', 500);
    }
  });

  api.delete('/accounts/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    try {
      mutateDb((state) => {
        const acc = state.accounts.find((a) => a.id === id && !a.deleted_at);
        if (!acc) throw new DomainError('Akun tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, acc)) throw new DomainError('Akses ditolak.', 403);
        const hasTx = state.transactions.some(
          (t) => !t.deleted_at && (t.account_id === id || t.to_account_id === id)
        );
        if (hasTx) {
          acc.is_active = false;
          acc.updated_at = new Date().toISOString();
        } else {
          acc.deleted_at = new Date().toISOString();
        }
      });
      return sendSuccess(res, 'Akun berhasil dinonaktifkan atau dihapus', null);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal menghapus akun.', 500);
    }
  });

  api.get('/accounts/:id/transactions', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const accountId = Number(req.params.id);
    const acc = state.accounts.find((a) => a.id === accountId && !a.deleted_at);
    if (!acc) return sendError(res, 'Akun tidak ditemukan.', 404);
    if (!canViewRecord(state, req.userId!, acc)) return sendError(res, 'Akses ditolak.', 403);

    const txs = filterTransactions(state, req.userId!, { account_id: accountId }).map((t) =>
      hydrateTransaction(state, t)
    );
    return sendSuccess(res, 'Riwayat transaksi akun berhasil dimuat', txs);
  });

  // ---------------- CATEGORIES ----------------
  api.get('/categories', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const famIds = getUserFamilyIds(state, req.userId!);
    const cats = state.categories.filter(
      (c) => c.is_system || c.user_id === req.userId || (c.family_id && famIds.includes(c.family_id))
    );
    return sendSuccess(res, 'Daftar kategori berhasil dimuat', cats);
  });

  api.post('/categories', requireAuth, (req: AuthedRequest, res) => {
    const { name, type, color, icon } = req.body ?? {};
    if (!name || !['income', 'expense'].includes(type)) {
      return sendError(res, 'Validasi gagal', 422, { name: ['Nama dan jenis kategori wajib diisi.'] });
    }
    const cat = mutateDb((state) => {
      const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
      const item = {
        id: nextId(state, 'categories'),
        family_id: famId,
        user_id: req.userId!,
        name: String(name).trim(),
        type,
        icon: icon || 'Tag',
        color: color || (type === 'income' ? '#059669' : '#ef4444'),
        is_system: false,
      };
      state.categories.push(item);
      return item;
    });
    return sendSuccess(res, 'Kategori berhasil ditambahkan', cat, 201);
  });

  api.put('/categories/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { name, color } = req.body ?? {};
    try {
      const updated = mutateDb((state) => {
        const cat = state.categories.find((c) => c.id === id);
        if (!cat) throw new DomainError('Kategori tidak ditemukan.', 404);
        if (cat.is_system) throw new DomainError('Kategori bawaan sistem tidak dapat diubah.', 422);
        if (name) cat.name = String(name).trim();
        if (color) cat.color = color;
        return cat;
      });
      return sendSuccess(res, 'Kategori berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal memperbarui kategori.', 500);
    }
  });

  api.delete('/categories/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    try {
      mutateDb((state) => {
        const cat = state.categories.find((c) => c.id === id);
        if (!cat) throw new DomainError('Kategori tidak ditemukan.', 404);
        if (cat.is_system) throw new DomainError('Kategori bawaan sistem tidak dapat dihapus.', 422);
        state.categories = state.categories.filter((c) => c.id !== id);
      });
      return sendSuccess(res, 'Kategori berhasil dihapus', null);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal menghapus kategori.', 500);
    }
  });

  // ---------------- ATTACHMENTS ----------------
  api.post('/attachments', requireAuth, (req: AuthedRequest, res) => {
    const { file_name, mime_type, content_base64 } = req.body ?? {};
    if (!file_name || !content_base64) {
      return sendError(res, 'Lampiran file tidak valid.', 422);
    }
    const attachment = mutateDb((state) => {
      const id = nextId(state, 'attachments');
      const uploadDir = path.resolve(process.cwd(), '.data', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const cleanName = String(file_name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedName = `${id}_${cleanName}`;
      const base64Data = String(content_base64).includes(',')
        ? String(content_base64).split(',')[1]
        : String(content_base64);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(path.join(uploadDir, storedName), buffer);

      const rec = {
        id,
        user_id: req.userId!,
        file_name: cleanName,
        mime_type: mime_type || 'application/octet-stream',
        size_bytes: buffer.length,
        url: `/api/v1/attachments/${id}`,
        created_at: new Date().toISOString(),
      };
      state.attachments.push(rec);
      return rec;
    });
    return sendSuccess(res, 'Bukti transaksi berhasil diunggah', attachment, 201);
  });

  api.get('/attachments/:id', (req, res) => {
    const id = Number(req.params.id);
    const state = getDbState();
    const att = state.attachments.find((a) => a.id === id);
    if (!att) return sendError(res, 'Lampiran tidak ditemukan.', 404);
    const uploadDir = path.resolve(process.cwd(), '.data', 'uploads');
    const filePath = path.join(uploadDir, `${att.id}_${att.file_name}`);
    if (!fs.existsSync(filePath)) return sendError(res, 'File tidak ditemukan.', 404);
    res.setHeader('Content-Type', att.mime_type);
    return res.sendFile(filePath);
  });

  // ---------------- TRANSACTIONS ----------------
  api.get('/transactions', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 15));

    const filtered = filterTransactions(state, req.userId!, {
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      space: (req.query.space as SpaceType | 'all') || 'all',
      member_id: req.query.member_id && req.query.member_id !== 'all' ? Number(req.query.member_id) : 'all',
      account_id: req.query.account_id && req.query.account_id !== 'all' ? Number(req.query.account_id) : 'all',
      type: (req.query.type as 'income' | 'expense' | 'transfer' | 'all') || 'all',
      category_id: req.query.category_id && req.query.category_id !== 'all' ? Number(req.query.category_id) : 'all',
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      start_date: typeof req.query.start_date === 'string' ? req.query.start_date : undefined,
      end_date: typeof req.query.end_date === 'string' ? req.query.end_date : undefined,
    });

    const total = filtered.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const slice = filtered.slice((page - 1) * perPage, page * perPage).map((t) => hydrateTransaction(state, t));

    return sendSuccess(res, 'Daftar transaksi berhasil dimuat', slice, 200, {
      current_page: page,
      last_page: lastPage,
      per_page: perPage,
      total,
    });
  });

  api.get('/transactions/export', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const format = req.query.format === 'excel' ? 'excel' : 'csv';
    const filtered = filterTransactions(state, req.userId!, {
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      space: (req.query.space as SpaceType | 'all') || 'all',
      type: (req.query.type as 'income' | 'expense' | 'transfer' | 'all') || 'all',
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    }).map((t) => hydrateTransaction(state, t));

    const rows = filtered.map((t) => ({
      Kode: t.reference_code,
      Tanggal: t.transaction_date,
      Jenis: t.type === 'income' ? 'Pemasukan' : t.type === 'expense' ? 'Pengeluaran' : 'Transfer',
      Kategori: t.category_name || '-',
      AkunAsal: t.account_name,
      AkunTujuan: t.to_account_name || '-',
      Nominal: t.amount,
      Ruang: t.space,
      Pencatat: t.recorder_name,
      Catatan: t.notes || '',
    }));

    const headers = ['Kode', 'Tanggal', 'Jenis', 'Kategori', 'AkunAsal', 'AkunTujuan', 'Nominal', 'Ruang', 'Pencatat', 'Catatan'];
    if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="transaksi-family-finance.xls"');
      return res.send(buildExcelHtml('Laporan Transaksi Family Finance', rows, headers));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transaksi-family-finance.csv"');
    return res.send(buildCsvContent(rows, headers));
  });

  api.post('/transactions', requireAuth, (req: AuthedRequest, res) => {
    const idemHeader = req.headers['x-idempotency-key'];
    const idempotency_key =
      (typeof idemHeader === 'string' && idemHeader) || req.body?.idempotency_key || null;

    try {
      const { transaction, deduplicated } = mutateDb((state) =>
        createTransaction(state, req.userId!, {
          ...req.body,
          idempotency_key,
        })
      );
      return sendSuccess(
        res,
        deduplicated ? 'Transaksi sudah tercatat (idempotent)' : 'Transaksi berhasil disimpan',
        transaction,
        deduplicated ? 200 : 201
      );
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal menyimpan transaksi.', 500);
    }
  });

  api.get('/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const tx = state.transactions.find((t) => t.id === Number(req.params.id) && !t.deleted_at);
    if (!tx) return sendError(res, 'Transaksi tidak ditemukan.', 404);
    if (!canViewRecord(state, req.userId!, tx)) return sendError(res, 'Akses ditolak.', 403);
    return sendSuccess(res, 'Detail transaksi berhasil dimuat', hydrateTransaction(state, tx));
  });

  api.put('/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    try {
      const updated = mutateDb((state) =>
        updateTransaction(state, req.userId!, Number(req.params.id), req.body ?? {})
      );
      return sendSuccess(res, 'Transaksi berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal memperbarui transaksi.', 500);
    }
  });

  api.delete('/transactions/:id', requireAuth, (req: AuthedRequest, res) => {
    try {
      mutateDb((state) => deleteTransaction(state, req.userId!, Number(req.params.id)));
      return sendSuccess(res, 'Transaksi berhasil dihapus dan saldo diperbarui', null);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal menghapus transaksi.', 500);
    }
  });

  // ---------------- BUDGETS ----------------
  api.get('/budgets', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const data = computeBudgets(state, req.userId!, filters);
    return sendSuccess(res, 'Daftar anggaran berhasil dimuat', data);
  });

  api.post('/budgets', requireAuth, (req: AuthedRequest, res) => {
    const { category_id, period, month, year, space, amount_limit } = req.body ?? {};
    if (!category_id || !amount_limit || Number(amount_limit) <= 0) {
      return sendError(res, 'Validasi gagal', 422, { amount_limit: ['Kategori dan batas anggaran wajib valid.'] });
    }
    const created = mutateDb((state) => {
      const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
      const now = new Date();
      const targetMonth = period === 'yearly' ? null : (Number(month) || now.getMonth() + 1);
      const targetYear = Number(year) || now.getFullYear();
      const id = nextId(state, 'budgets');
      state.budgets.push({
        id,
        user_id: req.userId!,
        family_id: famId,
        category_id: Number(category_id),
        period: period === 'yearly' ? 'yearly' : 'monthly',
        month: targetMonth,
        year: targetYear,
        space: (space || 'keluarga') as SpaceType,
        amount_limit: Number(amount_limit),
        created_at: new Date().toISOString(),
      });
      return computeBudgets(state, req.userId!, {
        month: targetMonth ?? now.getMonth() + 1,
        year: targetYear,
        space: 'all',
      }).find((b) => b.id === id);
    });
    return sendSuccess(res, 'Anggaran berhasil dibuat', created, 201);
  });

  api.get('/budgets/:id', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const now = new Date();
    const b = computeBudgets(state, req.userId!, {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      space: 'all',
    }).find((item) => item.id === Number(req.params.id));
    if (!b) return sendError(res, 'Anggaran tidak ditemukan.', 404);
    return sendSuccess(res, 'Detail anggaran berhasil dimuat', b);
  });

  api.put('/budgets/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { amount_limit, space } = req.body ?? {};
    try {
      const updated = mutateDb((state) => {
        const b = state.budgets.find((item) => item.id === id);
        if (!b) throw new DomainError('Anggaran tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, b)) throw new DomainError('Akses ditolak.', 403);
        if (amount_limit !== undefined) b.amount_limit = Number(amount_limit);
        if (space) b.space = space;
        return computeBudgets(state, req.userId!, {
          month: b.month ?? new Date().getMonth() + 1,
          year: b.year,
          space: 'all',
        }).find((item) => item.id === id);
      });
      return sendSuccess(res, 'Anggaran berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal memperbarui anggaran.', 500);
    }
  });

  api.delete('/budgets/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    try {
      mutateDb((state) => {
        const b = state.budgets.find((item) => item.id === id);
        if (!b) throw new DomainError('Anggaran tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, b)) throw new DomainError('Akses ditolak.', 403);
        state.budgets = state.budgets.filter((item) => item.id !== id);
      });
      return sendSuccess(res, 'Anggaran berhasil dihapus', null);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal menghapus anggaran.', 500);
    }
  });

  // ---------------- SAVINGS GOALS ----------------
  api.get('/savings-goals', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const goals = state.savings_goals
      .filter((g) => canViewRecord(state, req.userId!, g))
      .map((g) => hydrateSavingsGoal(state, g.id)!)
      .filter(Boolean);
    return sendSuccess(res, 'Target tabungan berhasil dimuat', goals);
  });

  api.post('/savings-goals', requireAuth, (req: AuthedRequest, res) => {
    const { name, target_amount, start_date, target_date, account_id, space } = req.body ?? {};
    if (!name || !target_amount || Number(target_amount) <= 0) {
      return sendError(res, 'Validasi gagal', 422, { name: ['Nama target dan nominal wajib valid.'] });
    }
    const goal = mutateDb((state) => {
      const id = nextId(state, 'savings_goals');
      const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
      state.savings_goals.push({
        id,
        user_id: req.userId!,
        family_id: famId,
        account_id: account_id ? Number(account_id) : null,
        name: String(name).trim(),
        target_amount: Number(target_amount),
        current_amount: 0,
        start_date: start_date || getNowTodayISO(),
        target_date: target_date || getNowFutureDateISO(365),
        space: (space || 'keluarga') as SpaceType,
        status: 'active',
        created_at: new Date().toISOString(),
      });
      return hydrateSavingsGoal(state, id);
    });
    return sendSuccess(res, 'Target tabungan berhasil dibuat', goal, 201);
  });

  api.post('/savings-goals/:id/contributions', requireAuth, (req: AuthedRequest, res) => {
    try {
      const updated = mutateDb((state) =>
        addSavingsContribution(state, req.userId!, Number(req.params.id), {
          source_account_id: req.body?.source_account_id ? Number(req.body.source_account_id) : null,
          amount: Number(req.body?.amount),
          contribution_date: req.body?.contribution_date || getNowTodayISO(),
          notes: req.body?.notes,
        })
      );
      return sendSuccess(res, 'Setoran tabungan berhasil dicatat', updated, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal mencatat setoran tabungan.', 500);
    }
  });

  api.get('/savings-goals/:id/history', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const goal = hydrateSavingsGoal(state, Number(req.params.id));
    if (!goal) return sendError(res, 'Target tabungan tidak ditemukan.', 404);
    if (!canViewRecord(state, req.userId!, goal)) return sendError(res, 'Akses ditolak.', 403);
    return sendSuccess(res, 'Riwayat setoran tabungan berhasil dimuat', goal.contributions ?? []);
  });

  // ---------------- EMERGENCY FUNDS ----------------
  api.get('/emergency-funds', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const funds = state.emergency_funds
      .filter((f) => canViewRecord(state, req.userId!, f))
      .map((f) => hydrateEmergencyFund(state, f.id)!)
      .filter(Boolean);
    return sendSuccess(res, 'Data dana darurat berhasil dimuat', funds);
  });

  api.post('/emergency-funds', requireAuth, (req: AuthedRequest, res) => {
    const { name, target_amount, space, account_ids } = req.body ?? {};
    if (!name || !target_amount || Number(target_amount) <= 0) {
      return sendError(res, 'Validasi gagal', 422, { target_amount: ['Target dana darurat wajib diisi.'] });
    }
    const fund = mutateDb((state) => {
      const id = nextId(state, 'emergency_funds');
      const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
      state.emergency_funds.push({
        id,
        user_id: req.userId!,
        family_id: famId,
        name: String(name).trim(),
        target_amount: Number(target_amount),
        current_amount: 0,
        space: (space || 'keluarga') as SpaceType,
        account_ids: Array.isArray(account_ids) ? account_ids.map(Number) : [],
        created_at: new Date().toISOString(),
      });
      return hydrateEmergencyFund(state, id);
    });
    return sendSuccess(res, 'Dana darurat berhasil dibuat', fund, 201);
  });

  api.put('/emergency-funds/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { name, target_amount, account_ids } = req.body ?? {};
    try {
      const fund = mutateDb((state) => {
        const f = state.emergency_funds.find((item) => item.id === id);
        if (!f) throw new DomainError('Dana darurat tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, f)) throw new DomainError('Akses ditolak.', 403);
        if (name) f.name = String(name).trim();
        if (target_amount !== undefined && Number(target_amount) > 0) f.target_amount = Number(target_amount);
        if (Array.isArray(account_ids)) f.account_ids = account_ids.map(Number);
        return hydrateEmergencyFund(state, id);
      });
      return sendSuccess(res, 'Target dana darurat berhasil diperbarui', fund);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal memperbarui dana darurat.', 500);
    }
  });

  api.post('/emergency-funds/:id/transactions', requireAuth, (req: AuthedRequest, res) => {
    try {
      const updated = mutateDb((state) =>
        addEmergencyFundTransaction(state, req.userId!, Number(req.params.id), {
          type: req.body?.type === 'withdrawal' ? 'withdrawal' : 'deposit',
          account_id: req.body?.account_id ? Number(req.body.account_id) : null,
          amount: Number(req.body?.amount),
          transaction_date: req.body?.transaction_date || getNowTodayISO(),
          notes: req.body?.notes,
        })
      );
      return sendSuccess(res, 'Mutasi dana darurat berhasil dicatat', updated, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal mencatat mutasi dana darurat.', 500);
    }
  });

  // ---------------- INVESTMENTS ----------------
  api.get('/investments', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const list = state.investments
      .filter((i) => canViewRecord(state, req.userId!, i))
      .map((i) => hydrateInvestment(state, i.id)!)
      .filter(Boolean);
    return sendSuccess(res, 'Portofolio investasi berhasil dimuat', list);
  });

  api.post('/investments', requireAuth, (req: AuthedRequest, res) => {
    const { name, platform, type, purchase_date, units, unit_label, buy_price_per_unit, current_market_price, space, source_account_id } = req.body ?? {};
    if (!name || !platform || Number(units) <= 0 || Number(buy_price_per_unit) <= 0) {
      return sendError(res, 'Validasi gagal', 422, { name: ['Lengkapi nama aset, platform, jumlah unit, dan harga beli.'] });
    }
    try {
      const created = mutateDb((state) => {
        const id = nextId(state, 'investments');
        const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
        const qty = Number(units);
        const buyPrice = Number(buy_price_per_unit);
        const totalCost = Math.round(qty * buyPrice * 100) / 100;
        const now = new Date().toISOString();

        // Buying an investment moves cash from source account without counting as consumptive expense
        if (source_account_id) {
          const src = state.accounts.find((a) => a.id === Number(source_account_id) && !a.deleted_at);
          if (!src) throw new DomainError('Akun sumber tidak ditemukan.', 404);
          if (src.current_balance < totalCost) {
            throw new DomainError('Saldo akun sumber tidak mencukupi untuk pembelian investasi.', 422);
          }
          createTransaction(state, req.userId!, {
            type: 'expense',
            category_id: 18,
            account_id: Number(source_account_id),
            amount: totalCost,
            space: (space || 'keluarga') as SpaceType,
            transaction_date: purchase_date || getNowTodayISO(),
            notes: `Pembelian investasi (alokasi aset): ${name}`,
            is_asset_allocation: true,
          });
        }

        state.investments.push({
          id,
          user_id: req.userId!,
          family_id: famId,
          name: String(name).trim(),
          platform: String(platform).trim(),
          type: type || 'digital_gold',
          purchase_date: purchase_date || getNowTodayISO(),
          units: qty,
          unit_label: unit_label || (type === 'digital_gold' ? 'gram' : 'unit'),
          buy_price_per_unit: buyPrice,
          total_cost: totalCost,
          current_market_price: Number(current_market_price) || buyPrice,
          space: (space || 'keluarga') as SpaceType,
          price_source: 'manual',
          updated_at: now,
        });

        state.investment_transactions.push({
          id: nextId(state, 'investment_transactions'),
          investment_id: id,
          user_id: req.userId!,
          type: 'buy',
          account_id: source_account_id ? Number(source_account_id) : null,
          units: qty,
          price_per_unit: buyPrice,
          total_amount: totalCost,
          transaction_date: purchase_date || getNowTodayISO(),
          notes: 'Pembelian awal aset',
          created_at: now,
        });

        return hydrateInvestment(state, id);
      });
      return sendSuccess(res, 'Aset investasi berhasil ditambahkan', created, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal menambahkan investasi.', 500);
    }
  });

  api.get('/investments/:id', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const inv = hydrateInvestment(state, Number(req.params.id));
    if (!inv) return sendError(res, 'Investasi tidak ditemukan.', 404);
    if (!canViewRecord(state, req.userId!, inv)) return sendError(res, 'Akses ditolak.', 403);
    return sendSuccess(res, 'Detail investasi berhasil dimuat', inv);
  });

  api.put('/investments/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { current_market_price, platform, name } = req.body ?? {};
    try {
      const updated = mutateDb((state) => {
        const inv = state.investments.find((i) => i.id === id);
        if (!inv) throw new DomainError('Investasi tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, inv)) throw new DomainError('Akses ditolak.', 403);
        if (current_market_price !== undefined && Number(current_market_price) >= 0) {
          inv.current_market_price = Number(current_market_price);
          inv.price_source = 'manual';
        }
        if (platform) inv.platform = String(platform).trim();
        if (name) inv.name = String(name).trim();
        inv.updated_at = new Date().toISOString();
        return hydrateInvestment(state, id);
      });
      return sendSuccess(res, 'Harga pasar investasi berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal memperbarui investasi.', 500);
    }
  });

  api.post('/investments/:id/transactions', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { type, units, price_per_unit, account_id, transaction_date, notes } = req.body ?? {};
    if (!['buy', 'sell', 'dividend'].includes(type) || Number(units) < 0 || Number(price_per_unit) <= 0) {
      return sendError(res, 'Validasi transaksi investasi gagal.', 422);
    }
    try {
      const updated = mutateDb((state) => {
        const inv = state.investments.find((i) => i.id === id);
        if (!inv) throw new DomainError('Investasi tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, inv)) throw new DomainError('Akses ditolak.', 403);

        const qty = Number(units);
        const price = Number(price_per_unit);
        const total = type === 'dividend' ? price : Math.round(qty * price * 100) / 100;

        if (type === 'buy') {
          if (account_id) {
            createTransaction(state, req.userId!, {
              type: 'expense',
              category_id: 18,
              account_id: Number(account_id),
              amount: total,
              space: inv.space,
              transaction_date: transaction_date || getNowTodayISO(),
              notes: `Tambah unit ${inv.name}`,
              is_asset_allocation: true,
            });
          }
          inv.total_cost = Math.round((inv.total_cost + total) * 100) / 100;
          inv.units = Math.round((inv.units + qty) * 10000) / 10000;
          inv.buy_price_per_unit = inv.units > 0 ? Math.round((inv.total_cost / inv.units) * 100) / 100 : price;
          inv.current_market_price = price;
        } else if (type === 'sell') {
          if (qty > inv.units) throw new DomainError('Jumlah unit jual melebihi kepemilikan.', 422);
          const avgCost = inv.units > 0 ? inv.total_cost / inv.units : 0;
          inv.units = Math.round((inv.units - qty) * 10000) / 10000;
          inv.total_cost = Math.max(0, Math.round((inv.total_cost - avgCost * qty) * 100) / 100);
          if (account_id) {
            createTransaction(state, req.userId!, {
              type: 'income',
              category_id: 6,
              account_id: Number(account_id),
              amount: total,
              space: inv.space,
              transaction_date: transaction_date || getNowTodayISO(),
              notes: `Penjualan unit ${inv.name}`,
              is_asset_allocation: true,
            });
          }
        } else if (type === 'dividend' && account_id) {
          createTransaction(state, req.userId!, {
            type: 'income',
            category_id: 6,
            account_id: Number(account_id),
            amount: total,
            space: inv.space,
            transaction_date: transaction_date || getNowTodayISO(),
            notes: `Dividen/Imbal hasil ${inv.name}`,
          });
        }

        inv.updated_at = new Date().toISOString();
        state.investment_transactions.push({
          id: nextId(state, 'investment_transactions'),
          investment_id: inv.id,
          user_id: req.userId!,
          type,
          account_id: account_id ? Number(account_id) : null,
          units: qty,
          price_per_unit: price,
          total_amount: total,
          transaction_date: transaction_date || getNowTodayISO(),
          notes: notes?.trim() || null,
          created_at: inv.updated_at,
        });

        return hydrateInvestment(state, inv.id);
      });
      return sendSuccess(res, 'Transaksi investasi berhasil dicatat', updated, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal mencatat transaksi investasi.', 500);
    }
  });

  // ---------------- BILLS ----------------
  api.get('/bills', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const bills = state.bills
      .filter((b) => canViewRecord(state, req.userId!, b))
      .map((b) => hydrateBill(state, b.id)!)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    return sendSuccess(res, 'Daftar tagihan berhasil dimuat', bills);
  });

  api.post('/bills', requireAuth, (req: AuthedRequest, res) => {
    const { name, category_id, account_id, amount, due_date, frequency, space, reminder_days_before } = req.body ?? {};
    if (!name || !amount || Number(amount) <= 0 || !due_date) {
      return sendError(res, 'Validasi gagal', 422, { name: ['Nama, nominal, dan tanggal jatuh tempo wajib diisi.'] });
    }
    const bill = mutateDb((state) => {
      const id = nextId(state, 'bills');
      const famId = getUserFamilyIds(state, req.userId!)[0] ?? null;
      state.bills.push({
        id,
        user_id: req.userId!,
        family_id: famId,
        category_id: category_id ? Number(category_id) : 11,
        account_id: account_id ? Number(account_id) : null,
        name: String(name).trim(),
        amount: Number(amount),
        due_date,
        frequency: frequency || 'monthly',
        space: (space || 'keluarga') as SpaceType,
        status: 'unpaid',
        reminder_days_before: Number(reminder_days_before) || 3,
        created_at: new Date().toISOString(),
      });
      return hydrateBill(state, id);
    });
    return sendSuccess(res, 'Tagihan berhasil ditambahkan', bill, 201);
  });

  api.put('/bills/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    try {
      const updated = mutateDb((state) => {
        const bill = state.bills.find((b) => b.id === id);
        if (!bill) throw new DomainError('Tagihan tidak ditemukan.', 404);
        if (!canWriteRecord(state, req.userId!, bill)) throw new DomainError('Akses ditolak.', 403);
        const { name, amount, due_date, frequency, status, account_id } = req.body ?? {};
        if (name) bill.name = String(name).trim();
        if (amount !== undefined) bill.amount = Number(amount);
        if (due_date) bill.due_date = due_date;
        if (frequency) bill.frequency = frequency;
        if (status) bill.status = status;
        if (account_id !== undefined) bill.account_id = account_id ? Number(account_id) : null;
        return hydrateBill(state, id);
      });
      return sendSuccess(res, 'Tagihan berhasil diperbarui', updated);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status);
      return sendError(res, 'Gagal memperbarui tagihan.', 500);
    }
  });

  api.post('/bills/:id/payments', requireAuth, (req: AuthedRequest, res) => {
    const { account_id, amount_paid, paid_date, notes } = req.body ?? {};
    if (!account_id || !amount_paid || Number(amount_paid) <= 0) {
      return sendError(res, 'Validasi pembayaran tagihan gagal.', 422);
    }
    try {
      const updated = mutateDb((state) =>
        payBill(state, req.userId!, Number(req.params.id), {
          account_id: Number(account_id),
          amount_paid: Number(amount_paid),
          paid_date: paid_date || getNowTodayISO(),
          notes,
        })
      );
      return sendSuccess(res, 'Pembayaran tagihan berhasil dicatat', updated, 201);
    } catch (err) {
      if (err instanceof DomainError) return sendError(res, err.message, err.status, err.errors);
      return sendError(res, 'Gagal membayar tagihan.', 500);
    }
  });

  // ---------------- NOTIFICATIONS ----------------
  api.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const list = state.notifications
      .filter((n) => n.user_id === req.userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sendSuccess(res, 'Notifikasi berhasil dimuat', list);
  });

  api.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    mutateDb((state) => {
      const notif = state.notifications.find((n) => n.id === Number(req.params.id) && n.user_id === req.userId);
      if (notif) notif.is_read = true;
    });
    return sendSuccess(res, 'Notifikasi ditandai sudah dibaca', null);
  });

  // ---------------- METADATA & REPORTS ----------------
  api.get('/meta/years', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const meta = computeAvailableYears(state, req.userId!);
    return sendSuccess(res, 'Rentang tahun tersedia berhasil dimuat', meta);
  });

  api.get('/reports/monthly', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const summary = computeDashboardSummary(state, req.userId!, filters);
    const expense_categories = computeExpenseCategories(state, req.userId!, filters);
    const txs = filterTransactions(state, req.userId!, filters).map((t) => hydrateTransaction(state, t));

    return sendSuccess(res, 'Laporan bulanan berhasil dimuat', {
      period: { month: filters.month, year: filters.year },
      summary,
      expense_categories,
      transactions: txs,
    });
  });

  api.get('/reports/yearly', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const year = Number(req.query.year) || new Date().getFullYear();
    const space = (req.query.space as SpaceType | 'all') || 'all';
    const months = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const txs = filterTransactions(state, req.userId!, { month: m, year, space });
      const income = txs
        .filter((t) => t.type === 'income' && !t.is_asset_allocation)
        .reduce((s, t) => s + Number(t.amount), 0);
      const expense = txs
        .filter((t) => t.type === 'expense' && !t.is_asset_allocation)
        .reduce((s, t) => s + Number(t.amount), 0);
      return {
        month: m,
        year,
        income,
        expense,
        net: income - expense,
      };
    });

    const total_income = months.reduce((s, m) => s + m.income, 0);
    const total_expense = months.reduce((s, m) => s + m.expense, 0);
    return sendSuccess(res, 'Laporan tahunan berhasil dimuat', {
      year,
      total_income,
      total_expense,
      net_savings: total_income - total_expense,
      months,
    });
  });

  api.get('/reports/multi-year', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const nowYear = new Date().getFullYear();
    const yearsMeta = computeAvailableYears(state, req.userId!);
    const defaultStart = Math.min(nowYear - 4, ...(yearsMeta.data_years.length ? yearsMeta.data_years : [nowYear - 4]));
    const defaultEnd = Math.max(nowYear, ...(yearsMeta.data_years.length ? yearsMeta.data_years : [nowYear]));
    const rawStart = Number(req.query.start_year) || defaultStart;
    const rawEnd = Number(req.query.end_year) || defaultEnd;
    const start_year = Math.min(rawStart, rawEnd);
    const end_year = Math.max(rawStart, rawEnd);
    const space = typeof req.query.space === 'string' && ['pribadi', 'keluarga', 'anak', 'all'].includes(req.query.space)
      ? (req.query.space as SpaceType | 'all')
      : 'all';

    const series = computeMultiYearSummary(state, req.userId!, start_year, end_year, space);
    return sendSuccess(res, 'Laporan perbandingan multi-tahun berhasil dimuat', {
      start_year,
      end_year,
      series,
    });
  });

  api.get('/reports/cash-flow', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const months = Number(req.query.months) || 12;
    const data = computeCashFlowSeries(state, req.userId!, filters, months);
    return sendSuccess(res, 'Laporan arus kas berhasil dimuat', data);
  });

  api.get('/reports/expenses', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const categories = computeExpenseCategories(state, req.userId!, filters);
    const transactions = filterTransactions(state, req.userId!, {
      ...filters,
      type: 'expense',
    })
      .filter((t) => !t.is_asset_allocation)
      .map((t) => hydrateTransaction(state, t));
    return sendSuccess(res, 'Laporan pengeluaran berhasil dimuat', { categories, transactions });
  });

  api.get('/reports/income', requireAuth, (req: AuthedRequest, res) => {
    const state = getDbState();
    const filters = parseFilters(req.query);
    const transactions = filterTransactions(state, req.userId!, {
      ...filters,
      type: 'income',
    })
      .filter((t) => !t.is_asset_allocation)
      .map((t) => hydrateTransaction(state, t));

    const grouped = new Map<number, { category_id: number; category_name: string; total: number }>();
    for (const tx of transactions) {
      if (!tx.category_id) continue;
      const existing = grouped.get(tx.category_id) ?? {
        category_id: tx.category_id,
        category_name: tx.category_name ?? 'Lainnya',
        total: 0,
      };
      existing.total += tx.amount;
      grouped.set(tx.category_id, existing);
    }

    return sendSuccess(res, 'Laporan pemasukan berhasil dimuat', {
      categories: Array.from(grouped.values()).sort((a, b) => b.total - a.total),
      transactions,
    });
  });

  app.use('/api/v1', api);

  // Vite middleware in dev, static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Family Finance server running at http://localhost:${PORT}`);
  });
}

bootstrapServer();
