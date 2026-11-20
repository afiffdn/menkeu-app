import crypto from 'node:crypto';
import type {
  Account,
  Bill,
  Budget,
  CashFlowPoint,
  DashboardFilters,
  DashboardSummary,
  EmergencyFund,
  ExpenseCategoryPoint,
  Family,
  FamilyRole,
  Investment,
  SavingsGoal,
  SpaceType,
  Transaction,
  TransactionType,
} from '../src/types/finance';
import type {
  AccountRecord,
  DatabaseState,
  TransactionRecord,
} from './types';

export class DomainError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(message: string, status = 422, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function nextId(state: DatabaseState, table: string): number {
  const current = state.nextIds[table] ?? 1;
  state.nextIds[table] = current + 1;
  return current;
}

export function getUserFamilyMembership(state: DatabaseState, userId: number, familyId?: number | null) {
  const memberships = state.family_members.filter((m) => m.user_id === userId);
  if (familyId != null) {
    return memberships.find((m) => m.family_id === familyId) ?? null;
  }
  return memberships[0] ?? null;
}

export function getUserFamilyIds(state: DatabaseState, userId: number): number[] {
  return state.family_members.filter((m) => m.user_id === userId).map((m) => m.family_id);
}

/**
 * Privacy & RBAC Policy:
 * - A user can always view their own records (user_id === currentUserId).
 * - If a record is in space 'pribadi' belonging to another user, ONLY visible if current user is the Owner/Admin AND can_view_private === true (explicitly granted). Otherwise strictly hidden.
 * - If a record is in space 'keluarga' or 'anak', visible to all members of that family.
 */
export function canViewRecord(
  state: DatabaseState,
  currentUserId: number,
  record: { user_id: number; family_id: number | null; space: SpaceType }
): boolean {
  if (record.user_id === currentUserId) return true;
  if (record.family_id == null) return false;

  const membership = getUserFamilyMembership(state, currentUserId, record.family_id);
  if (!membership) return false;

  if (record.space === 'pribadi') {
    const ownerMembership = getUserFamilyMembership(state, record.user_id, record.family_id);
    // Private space of another member requires explicit permission
    return Boolean(ownerMembership && membership.can_view_private && (membership.role === 'owner' || membership.role === 'admin'));
  }

  return true;
}

export function canWriteRecord(
  state: DatabaseState,
  currentUserId: number,
  record: { user_id: number; family_id: number | null; space: SpaceType }
): boolean {
  if (record.user_id === currentUserId) {
    if (record.family_id != null) {
      const m = getUserFamilyMembership(state, currentUserId, record.family_id);
      if (m && m.role === 'viewer') return false;
    }
    return true;
  }
  if (record.family_id == null) return false;
  const membership = getUserFamilyMembership(state, currentUserId, record.family_id);
  if (!membership) return false;
  if (record.space === 'pribadi') return false;
  return membership.role === 'owner' || membership.role === 'admin';
}

export function assertCanManageFamily(
  state: DatabaseState,
  currentUserId: number,
  familyId: number,
  allowedRoles: FamilyRole[] = ['owner', 'admin']
) {
  const membership = getUserFamilyMembership(state, currentUserId, familyId);
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new DomainError('Anda tidak memiliki izin untuk mengelola data keluarga ini.', 403);
  }
  return membership;
}

export function recalculateAccountBalance(state: DatabaseState, accountId: number): number {
  const account = state.accounts.find((a) => a.id === accountId && !a.deleted_at);
  if (!account) return 0;

  let balance = Number(account.initial_balance);
  for (const tx of state.transactions) {
    if (tx.deleted_at) continue;
    const amount = Number(tx.amount);
    if (tx.type === 'income' && tx.account_id === accountId) {
      balance += amount;
    } else if (tx.type === 'expense' && tx.account_id === accountId) {
      balance -= amount;
    } else if (tx.type === 'transfer') {
      if (tx.account_id === accountId) {
        balance -= amount;
      }
      if (tx.to_account_id === accountId) {
        balance += amount;
      }
    }
  }
  account.current_balance = Math.round(balance * 100) / 100;
  return account.current_balance;
}

export function recalculateAllAccountBalances(state: DatabaseState): void {
  for (const account of state.accounts) {
    if (!account.deleted_at) {
      recalculateAccountBalance(state, account.id);
    }
  }
}

function getUserName(state: DatabaseState, userId: number): string {
  return state.users.find((u) => u.id === userId)?.name ?? 'Pengguna';
}

export function hydrateAccount(state: DatabaseState, rec: AccountRecord): Account {
  return {
    id: rec.id,
    user_id: rec.user_id,
    owner_name: getUserName(state, rec.user_id),
    family_id: rec.family_id,
    name: rec.name,
    type: rec.type,
    initial_balance: rec.initial_balance,
    current_balance: rec.current_balance,
    currency: rec.currency,
    space: rec.space,
    description: rec.description,
    is_active: rec.is_active,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };
}

export function hydrateTransaction(state: DatabaseState, rec: TransactionRecord): Transaction {
  const category = rec.category_id ? state.categories.find((c) => c.id === rec.category_id) : null;
  const account = state.accounts.find((a) => a.id === rec.account_id);
  const toAccount = rec.to_account_id ? state.accounts.find((a) => a.id === rec.to_account_id) : null;
  const attachment = rec.attachment_id ? state.attachments.find((at) => at.id === rec.attachment_id) ?? null : null;

  return {
    id: rec.id,
    reference_code: rec.reference_code,
    user_id: rec.user_id,
    recorder_name: getUserName(state, rec.user_id),
    family_id: rec.family_id,
    type: rec.type,
    category_id: rec.category_id,
    category_name: category?.name ?? (rec.type === 'transfer' ? 'Transfer Antar-Akun' : null),
    account_id: rec.account_id,
    account_name: account?.name ?? 'Akun Tidak Ditemukan',
    to_account_id: rec.to_account_id,
    to_account_name: toAccount?.name ?? null,
    amount: rec.amount,
    space: rec.space,
    transaction_date: rec.transaction_date,
    notes: rec.notes,
    idempotency_key: rec.idempotency_key,
    attachment,
    is_asset_allocation: rec.is_asset_allocation,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };
}

export interface CreateTransactionInput {
  type: TransactionType;
  category_id?: number | null;
  account_id: number;
  to_account_id?: number | null;
  amount: number;
  space?: SpaceType;
  transaction_date: string;
  notes?: string | null;
  idempotency_key?: string | null;
  attachment_id?: number | null;
  is_asset_allocation?: boolean;
}

export function createTransaction(
  state: DatabaseState,
  currentUserId: number,
  input: CreateTransactionInput
): { transaction: Transaction; deduplicated: boolean } {
  const idemKey = input.idempotency_key?.trim() || null;
  if (idemKey) {
    const existing = state.transactions.find(
      (tx) => !tx.deleted_at && tx.user_id === currentUserId && tx.idempotency_key === idemKey
    );
    if (existing) {
      return { transaction: hydrateTransaction(state, existing), deduplicated: true };
    }
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainError('Nominal transaksi harus lebih besar dari 0.', 422, {
      amount: ['Nominal harus lebih besar dari Rp0.'],
    });
  }

  const account = state.accounts.find((a) => a.id === input.account_id && !a.deleted_at);
  if (!account) {
    throw new DomainError('Akun asal tidak ditemukan.', 404, {
      account_id: ['Akun tidak valid atau telah dihapus.'],
    });
  }
  if (!canViewRecord(state, currentUserId, account) || !account.is_active) {
    throw new DomainError('Anda tidak memiliki akses ke akun asal ini atau akun tidak aktif.', 403);
  }
  const membership = account.family_id ? getUserFamilyMembership(state, currentUserId, account.family_id) : null;
  if (membership?.role === 'viewer') {
    throw new DomainError('Role Viewer tidak dapat mencatat transaksi.', 403);
  }

  let toAccount: AccountRecord | null = null;
  if (input.type === 'transfer') {
    if (!input.to_account_id) {
      throw new DomainError('Akun tujuan wajib dipilih untuk transaksi transfer.', 422, {
        to_account_id: ['Akun tujuan wajib diisi.'],
      });
    }
    if (input.to_account_id === input.account_id) {
      throw new DomainError('Akun asal dan akun tujuan tidak boleh sama.', 422, {
        to_account_id: ['Pilih akun tujuan yang berbeda dari akun asal.'],
      });
    }
    toAccount = state.accounts.find((a) => a.id === input.to_account_id && !a.deleted_at) ?? null;
    if (!toAccount || !canViewRecord(state, currentUserId, toAccount) || !toAccount.is_active) {
      throw new DomainError('Akun tujuan tidak ditemukan atau tidak aktif.', 422, {
        to_account_id: ['Akun tujuan tidak valid.'],
      });
    }
  } else {
    if (!input.category_id) {
      throw new DomainError('Kategori wajib dipilih untuk pemasukan atau pengeluaran.', 422, {
        category_id: ['Kategori wajib diisi.'],
      });
    }
    const category = state.categories.find((c) => c.id === input.category_id);
    if (!category || category.type !== input.type) {
      throw new DomainError('Kategori tidak sesuai dengan jenis transaksi.', 422, {
        category_id: ['Kategori tidak valid untuk jenis transaksi ini.'],
      });
    }
  }

  if (input.type === 'expense' || input.type === 'transfer') {
    const currentBal = recalculateAccountBalance(state, account.id);
    if (currentBal < amount) {
      throw new DomainError(
        `Saldo akun "${account.name}" tidak mencukupi (tersedia ${new Intl.NumberFormat('id-ID').format(currentBal)}).`,
        422,
        { amount: ['Saldo akun tidak mencukupi untuk transaksi ini.'] }
      );
    }
  }

  const now = new Date().toISOString();
  const id = nextId(state, 'transactions');
  const datePart = input.transaction_date.replaceAll('-', '').slice(0, 6);
  const record: TransactionRecord = {
    id,
    reference_code: `TRX-${datePart}-${String(id).padStart(3, '0')}`,
    user_id: currentUserId,
    family_id: account.family_id ?? getUserFamilyIds(state, currentUserId)[0] ?? null,
    type: input.type,
    category_id: input.type === 'transfer' ? null : (input.category_id ?? null),
    account_id: account.id,
    to_account_id: input.type === 'transfer' ? toAccount!.id : null,
    amount: Math.round(amount * 100) / 100,
    space: input.space ?? account.space,
    transaction_date: input.transaction_date,
    notes: input.notes?.trim() || null,
    idempotency_key: idemKey,
    attachment_id: input.attachment_id ?? null,
    is_asset_allocation: Boolean(input.is_asset_allocation || input.type === 'transfer'),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  state.transactions.push(record);
  recalculateAccountBalance(state, account.id);
  if (toAccount) {
    recalculateAccountBalance(state, toAccount.id);
  }
  account.updated_at = now;
  if (toAccount) toAccount.updated_at = now;

  return { transaction: hydrateTransaction(state, record), deduplicated: false };
}

export function updateTransaction(
  state: DatabaseState,
  currentUserId: number,
  transactionId: number,
  input: Partial<CreateTransactionInput>
): Transaction {
  const existing = state.transactions.find((t) => t.id === transactionId && !t.deleted_at);
  if (!existing) {
    throw new DomainError('Transaksi tidak ditemukan.', 404);
  }
  if (!canWriteRecord(state, currentUserId, existing)) {
    throw new DomainError('Anda tidak memiliki izin mengubah transaksi ini.', 403);
  }

  const oldAccountId = existing.account_id;
  const oldToAccountId = existing.to_account_id;

  const nextType = input.type ?? existing.type;
  const nextAccountId = input.account_id ?? existing.account_id;
  const nextToAccountId = nextType === 'transfer' ? (input.to_account_id ?? existing.to_account_id) : null;
  const nextAmount = input.amount !== undefined ? Number(input.amount) : existing.amount;
  const nextCategoryId = nextType === 'transfer' ? null : (input.category_id ?? existing.category_id);

  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new DomainError('Nominal transaksi harus lebih besar dari 0.', 422, {
      amount: ['Nominal harus lebih besar dari Rp0.'],
    });
  }

  const newAccount = state.accounts.find((a) => a.id === nextAccountId && !a.deleted_at);
  if (!newAccount || !canViewRecord(state, currentUserId, newAccount)) {
    throw new DomainError('Akun asal tidak valid.', 422);
  }

  if (nextType === 'transfer') {
    if (!nextToAccountId || nextToAccountId === nextAccountId) {
      throw new DomainError('Akun tujuan transfer tidak valid.', 422);
    }
    const newTo = state.accounts.find((a) => a.id === nextToAccountId && !a.deleted_at);
    if (!newTo || !canViewRecord(state, currentUserId, newTo)) {
      throw new DomainError('Akun tujuan tidak valid.', 422);
    }
  } else {
    const cat = state.categories.find((c) => c.id === nextCategoryId);
    if (!cat || cat.type !== nextType) {
      throw new DomainError('Kategori tidak sesuai dengan jenis transaksi.', 422);
    }
  }

  // Temporarily snapshot rollback values if balance check fails
  const backup = { ...existing };
  existing.type = nextType;
  existing.account_id = nextAccountId;
  existing.to_account_id = nextToAccountId;
  existing.amount = Math.round(nextAmount * 100) / 100;
  existing.category_id = nextCategoryId;
  existing.space = input.space ?? existing.space;
  existing.transaction_date = input.transaction_date ?? existing.transaction_date;
  existing.notes = input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes;
  existing.attachment_id = input.attachment_id !== undefined ? input.attachment_id : existing.attachment_id;
  existing.is_asset_allocation = nextType === 'transfer' ? true : Boolean(input.is_asset_allocation ?? existing.is_asset_allocation);
  existing.updated_at = new Date().toISOString();

  // Recalculate affected balances and validate non-negative constraint
  const affected = new Set<number>([oldAccountId, nextAccountId]);
  if (oldToAccountId) affected.add(oldToAccountId);
  if (nextToAccountId) affected.add(nextToAccountId);

  for (const accId of affected) {
    const bal = recalculateAccountBalance(state, accId);
    if (bal < 0) {
      Object.assign(existing, backup);
      for (const idToReset of affected) {
        recalculateAccountBalance(state, idToReset);
      }
      throw new DomainError('Perubahan menyebabkan saldo akun menjadi negatif.', 422, {
        amount: ['Nominal melebihi saldo akun yang tersedia.'],
      });
    }
  }

  return hydrateTransaction(state, existing);
}

export function deleteTransaction(state: DatabaseState, currentUserId: number, transactionId: number): void {
  const existing = state.transactions.find((t) => t.id === transactionId && !t.deleted_at);
  if (!existing) {
    throw new DomainError('Transaksi tidak ditemukan.', 404);
  }
  if (!canWriteRecord(state, currentUserId, existing)) {
    throw new DomainError('Anda tidak memiliki izin menghapus transaksi ini.', 403);
  }

  existing.deleted_at = new Date().toISOString();
  existing.updated_at = existing.deleted_at;

  recalculateAccountBalance(state, existing.account_id);
  if (existing.to_account_id) {
    recalculateAccountBalance(state, existing.to_account_id);
  }
}

export function computeBudgets(
  state: DatabaseState,
  currentUserId: number,
  filters: { month?: number; year?: number; space?: SpaceType | 'all' }
): Budget[] {
  const year = filters.year ?? 2026;
  const month = filters.month ?? 11;

  return state.budgets
    .filter((b) => canViewRecord(state, currentUserId, b))
    .filter((b) => {
      if (filters.space && filters.space !== 'all' && b.space !== filters.space) return false;
      if (b.year !== year) return false;
      if (b.period === 'monthly' && b.month !== month) return false;
      return true;
    })
    .map((b) => {
      const category = state.categories.find((c) => c.id === b.category_id);
      const spent = state.transactions
        .filter((tx) => !tx.deleted_at && tx.type === 'expense' && !tx.is_asset_allocation)
        .filter((tx) => canViewRecord(state, currentUserId, tx))
        .filter((tx) => {
          if (tx.category_id !== b.category_id) return false;
          if (tx.space !== b.space) return false;
          const [txYear, txMonth] = tx.transaction_date.split('-').map(Number);
          if (txYear !== b.year) return false;
          if (b.period === 'monthly' && txMonth !== b.month) return false;
          return true;
        })
        .reduce((sum, tx) => sum + Number(tx.amount), 0);

      const pct = b.amount_limit > 0 ? Math.round((spent / b.amount_limit) * 1000) / 10 : 0;
      const status: Budget['status'] = pct > 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'safe';
      return {
        id: b.id,
        user_id: b.user_id,
        owner_name: getUserName(state, b.user_id),
        family_id: b.family_id,
        category_id: b.category_id,
        category_name: category?.name ?? 'Kategori',
        period: b.period,
        month: b.month,
        year: b.year,
        space: b.space,
        amount_limit: b.amount_limit,
        spent_amount: spent,
        remaining_amount: Math.max(0, b.amount_limit - spent),
        usage_percentage: pct,
        status,
        created_at: b.created_at,
      };
    });
}

export function hydrateSavingsGoal(state: DatabaseState, goalId: number): SavingsGoal | null {
  const goal = state.savings_goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const account = goal.account_id ? state.accounts.find((a) => a.id === goal.account_id) : null;
  const contributions = state.savings_contributions
    .filter((c) => c.savings_goal_id === goal.id)
    .sort((a, b) => b.contribution_date.localeCompare(a.contribution_date))
    .map((c) => ({
      id: c.id,
      savings_goal_id: c.savings_goal_id,
      user_id: c.user_id,
      contributor_name: getUserName(state, c.user_id),
      source_account_id: c.source_account_id,
      source_account_name: c.source_account_id
        ? (state.accounts.find((a) => a.id === c.source_account_id)?.name ?? null)
        : null,
      amount: c.amount,
      contribution_date: c.contribution_date,
      notes: c.notes,
      created_at: c.created_at,
    }));

  const progress = goal.target_amount > 0
    ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 1000) / 10)
    : 0;

  return {
    id: goal.id,
    user_id: goal.user_id,
    owner_name: getUserName(state, goal.user_id),
    family_id: goal.family_id,
    account_id: goal.account_id,
    account_name: account?.name ?? null,
    name: goal.name,
    target_amount: goal.target_amount,
    current_amount: goal.current_amount,
    progress_percentage: progress,
    start_date: goal.start_date,
    target_date: goal.target_date,
    space: goal.space,
    status: goal.status,
    contributions,
    created_at: goal.created_at,
  };
}

export function addSavingsContribution(
  state: DatabaseState,
  currentUserId: number,
  goalId: number,
  input: { source_account_id?: number | null; amount: number; contribution_date: string; notes?: string | null }
): SavingsGoal {
  const goal = state.savings_goals.find((g) => g.id === goalId);
  if (!goal) throw new DomainError('Target tabungan tidak ditemukan.', 404);
  if (!canViewRecord(state, currentUserId, goal)) {
    throw new DomainError('Akses ditolak.', 403);
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainError('Nominal setoran tabungan harus lebih dari 0.', 422);
  }

  // If source_account_id and goal.account_id differ, record a non-consumptive transfer transaction!
  if (input.source_account_id && goal.account_id && input.source_account_id !== goal.account_id) {
    createTransaction(state, currentUserId, {
      type: 'transfer',
      account_id: input.source_account_id,
      to_account_id: goal.account_id,
      amount,
      space: goal.space,
      transaction_date: input.contribution_date,
      notes: `Setoran tabungan: ${goal.name}${input.notes ? ` — ${input.notes}` : ''}`,
      is_asset_allocation: true,
    });
  } else if (input.source_account_id && !goal.account_id) {
    // Asset allocation transfer out of source account without counting as consumptive expense
    const src = state.accounts.find((a) => a.id === input.source_account_id && !a.deleted_at);
    if (!src) throw new DomainError('Akun sumber tidak ditemukan.', 404);
    if (src.current_balance < amount) {
      throw new DomainError('Saldo akun sumber tidak mencukupi.', 422);
    }
  }

  goal.current_amount = Math.round((goal.current_amount + amount) * 100) / 100;
  if (goal.current_amount >= goal.target_amount) {
    goal.status = 'completed';
  }

  state.savings_contributions.push({
    id: nextId(state, 'savings_contributions'),
    savings_goal_id: goal.id,
    user_id: currentUserId,
    source_account_id: input.source_account_id ?? null,
    amount,
    contribution_date: input.contribution_date,
    notes: input.notes?.trim() || null,
    created_at: new Date().toISOString(),
  });

  return hydrateSavingsGoal(state, goal.id)!;
}

export function hydrateEmergencyFund(state: DatabaseState, fundId: number): EmergencyFund | null {
  const fund = state.emergency_funds.find((f) => f.id === fundId);
  if (!fund) return null;

  const linkedAccounts = state.accounts
    .filter((a) => !a.deleted_at && fund.account_ids.includes(a.id))
    .map((a) => hydrateAccount(state, a));

  // If linked accounts exist, use their live sum; otherwise use fund.current_amount
  const liveAmount = linkedAccounts.length > 0
    ? linkedAccounts.reduce((s, a) => s + Number(a.current_balance), 0)
    : fund.current_amount;

  const txs = state.emergency_fund_transactions
    .filter((t) => t.emergency_fund_id === fund.id)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .map((t) => ({
      id: t.id,
      emergency_fund_id: t.emergency_fund_id,
      user_id: t.user_id,
      actor_name: getUserName(state, t.user_id),
      type: t.type,
      account_id: t.account_id,
      account_name: t.account_id ? (state.accounts.find((a) => a.id === t.account_id)?.name ?? null) : null,
      amount: t.amount,
      transaction_date: t.transaction_date,
      notes: t.notes,
      created_at: t.created_at,
    }));

  // Build cumulative growth series
  const chronological = [...txs].reverse();
  let running = 0;
  const byMonth = new Map<string, number>();
  for (const item of chronological) {
    running += item.type === 'deposit' ? item.amount : -item.amount;
    const ym = item.transaction_date.slice(0, 7);
    byMonth.set(ym, Math.max(0, running));
  }
  const history_series = Array.from(byMonth.entries()).map(([month, balance]) => ({
    month,
    balance,
  }));

  const shortfall = Math.max(0, fund.target_amount - liveAmount);
  const progress = fund.target_amount > 0
    ? Math.min(100, Math.round((liveAmount / fund.target_amount) * 1000) / 10)
    : 0;

  return {
    id: fund.id,
    user_id: fund.user_id,
    owner_name: getUserName(state, fund.user_id),
    family_id: fund.family_id,
    name: fund.name,
    target_amount: fund.target_amount,
    current_amount: liveAmount,
    shortfall_amount: shortfall,
    progress_percentage: progress,
    space: fund.space,
    account_ids: fund.account_ids,
    accounts: linkedAccounts,
    transactions: txs,
    history_series,
    created_at: fund.created_at,
  };
}

export function addEmergencyFundTransaction(
  state: DatabaseState,
  currentUserId: number,
  fundId: number,
  input: { type: 'deposit' | 'withdrawal'; account_id?: number | null; target_account_id?: number | null; amount: number; transaction_date: string; notes?: string | null }
): EmergencyFund {
  const fund = state.emergency_funds.find((f) => f.id === fundId);
  if (!fund) throw new DomainError('Dana darurat tidak ditemukan.', 404);
  if (!canViewRecord(state, currentUserId, fund)) throw new DomainError('Akses ditolak.', 403);

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainError('Nominal harus lebih dari 0.', 422);
  }

  const emergencyAccId = fund.account_ids[0] ?? input.target_account_id ?? null;

  if (input.type === 'deposit') {
    if (input.account_id && emergencyAccId && input.account_id !== emergencyAccId) {
      createTransaction(state, currentUserId, {
        type: 'transfer',
        account_id: input.account_id,
        to_account_id: emergencyAccId,
        amount,
        space: fund.space,
        transaction_date: input.transaction_date,
        notes: `Setoran Dana Darurat: ${fund.name}${input.notes ? ` — ${input.notes}` : ''}`,
        is_asset_allocation: true,
      });
    } else if (emergencyAccId && !input.account_id) {
      createTransaction(state, currentUserId, {
        type: 'income',
        category_id: 7,
        account_id: emergencyAccId,
        amount,
        space: fund.space,
        transaction_date: input.transaction_date,
        notes: `Setoran langsung Dana Darurat: ${fund.name}`,
        is_asset_allocation: true,
      });
    }
    fund.current_amount = Math.round((fund.current_amount + amount) * 100) / 100;
  } else {
    if (fund.current_amount < amount) {
      throw new DomainError('Saldo dana darurat tidak mencukupi untuk penarikan.', 422);
    }
    if (emergencyAccId && input.account_id && emergencyAccId !== input.account_id) {
      createTransaction(state, currentUserId, {
        type: 'transfer',
        account_id: emergencyAccId,
        to_account_id: input.account_id,
        amount,
        space: fund.space,
        transaction_date: input.transaction_date,
        notes: `Penarikan Dana Darurat: ${fund.name}${input.notes ? ` — ${input.notes}` : ''}`,
        is_asset_allocation: true,
      });
    }
    fund.current_amount = Math.round((fund.current_amount - amount) * 100) / 100;
  }

  state.emergency_fund_transactions.push({
    id: nextId(state, 'emergency_fund_transactions'),
    emergency_fund_id: fund.id,
    user_id: currentUserId,
    type: input.type,
    account_id: input.account_id ?? emergencyAccId,
    amount,
    transaction_date: input.transaction_date,
    notes: input.notes?.trim() || null,
    created_at: new Date().toISOString(),
  });

  return hydrateEmergencyFund(state, fund.id)!;
}

export function hydrateInvestment(state: DatabaseState, investmentId: number): Investment | null {
  const inv = state.investments.find((i) => i.id === investmentId);
  if (!inv) return null;

  const currentValue = Math.round(inv.units * inv.current_market_price * 100) / 100;
  const profitLoss = Math.round((currentValue - inv.total_cost) * 100) / 100;
  const profitLossPct = inv.total_cost > 0
    ? Math.round((profitLoss / inv.total_cost) * 10000) / 100
    : 0;

  const txs = state.investment_transactions
    .filter((t) => t.investment_id === inv.id)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .map((t) => ({
      id: t.id,
      investment_id: t.investment_id,
      user_id: t.user_id,
      type: t.type,
      account_id: t.account_id,
      account_name: t.account_id ? (state.accounts.find((a) => a.id === t.account_id)?.name ?? null) : null,
      units: t.units,
      price_per_unit: t.price_per_unit,
      total_amount: t.total_amount,
      transaction_date: t.transaction_date,
      notes: t.notes,
      created_at: t.created_at,
    }));

  return {
    id: inv.id,
    user_id: inv.user_id,
    owner_name: getUserName(state, inv.user_id),
    family_id: inv.family_id,
    name: inv.name,
    platform: inv.platform,
    asset_code: inv.asset_code ?? null,
    type: inv.type,
    purchase_date: inv.purchase_date,
    units: inv.units,
    unit_label: inv.unit_label,
    buy_price_per_unit: inv.buy_price_per_unit,
    total_cost: inv.total_cost,
    current_market_price: inv.current_market_price,
    current_value: currentValue,
    profit_loss: profitLoss,
    profit_loss_percentage: profitLossPct,
    space: inv.space,
    price_source: inv.price_source,
    transactions: txs,
    updated_at: inv.updated_at,
  };
}

export function hydrateBill(state: DatabaseState, billId: number): Bill | null {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return null;

  const now = new Date();
  const refDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dueDate = new Date(`${bill.due_date}T00:00:00Z`);
  const daysUntilDue = Math.ceil((dueDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

  const computedStatus = bill.status === 'paid'
    ? 'paid'
    : (daysUntilDue < 0 ? 'overdue' : 'unpaid');

  const payments = state.bill_payments
    .filter((p) => p.bill_id === bill.id)
    .sort((a, b) => b.paid_date.localeCompare(a.paid_date))
    .map((p) => ({
      id: p.id,
      bill_id: p.bill_id,
      user_id: p.user_id,
      payer_name: getUserName(state, p.user_id),
      account_id: p.account_id,
      account_name: state.accounts.find((a) => a.id === p.account_id)?.name ?? 'Akun',
      amount_paid: p.amount_paid,
      paid_date: p.paid_date,
      notes: p.notes,
      created_at: p.created_at,
    }));

  return {
    id: bill.id,
    user_id: bill.user_id,
    owner_name: getUserName(state, bill.user_id),
    family_id: bill.family_id,
    category_id: bill.category_id,
    category_name: bill.category_id ? (state.categories.find((c) => c.id === bill.category_id)?.name ?? null) : null,
    account_id: bill.account_id,
    account_name: bill.account_id ? (state.accounts.find((a) => a.id === bill.account_id)?.name ?? null) : null,
    name: bill.name,
    amount: bill.amount,
    due_date: bill.due_date,
    frequency: bill.frequency,
    space: bill.space,
    status: computedStatus,
    reminder_days_before: bill.reminder_days_before,
    days_until_due: daysUntilDue,
    payments,
    created_at: bill.created_at,
  };
}

export function payBill(
  state: DatabaseState,
  currentUserId: number,
  billId: number,
  input: { account_id: number; amount_paid: number; paid_date: string; notes?: string | null }
): Bill {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) throw new DomainError('Tagihan tidak ditemukan.', 404);
  if (!canViewRecord(state, currentUserId, bill)) throw new DomainError('Akses ditolak.', 403);

  const expenseCategoryId = bill.category_id ?? 11; // Tagihan
  createTransaction(state, currentUserId, {
    type: 'expense',
    category_id: expenseCategoryId,
    account_id: input.account_id,
    amount: input.amount_paid,
    space: bill.space,
    transaction_date: input.paid_date,
    notes: `Pembayaran Tagihan: ${bill.name}${input.notes ? ` — ${input.notes}` : ''}`,
  });

  bill.status = 'paid';
  state.bill_payments.push({
    id: nextId(state, 'bill_payments'),
    bill_id: bill.id,
    user_id: currentUserId,
    account_id: input.account_id,
    amount_paid: input.amount_paid,
    paid_date: input.paid_date,
    notes: input.notes?.trim() || null,
    created_at: new Date().toISOString(),
  });

  return hydrateBill(state, bill.id)!;
}

export function filterTransactions(
  state: DatabaseState,
  currentUserId: number,
  filters: {
    month?: number;
    year?: number;
    space?: SpaceType | 'all';
    member_id?: number | 'all';
    account_id?: number | 'all';
    type?: TransactionType | 'all';
    category_id?: number | 'all';
    search?: string;
    start_date?: string;
    end_date?: string;
  }
): TransactionRecord[] {
  return state.transactions
    .filter((tx) => !tx.deleted_at)
    .filter((tx) => canViewRecord(state, currentUserId, tx))
    .filter((tx) => {
      if (filters.space && filters.space !== 'all' && tx.space !== filters.space) return false;
      if (filters.member_id && filters.member_id !== 'all' && tx.user_id !== filters.member_id) return false;
      if (
        filters.account_id &&
        filters.account_id !== 'all' &&
        tx.account_id !== filters.account_id &&
        tx.to_account_id !== filters.account_id
      ) {
        return false;
      }
      if (filters.type && filters.type !== 'all' && tx.type !== filters.type) return false;
      if (filters.category_id && filters.category_id !== 'all' && tx.category_id !== filters.category_id) return false;
      if (filters.start_date && tx.transaction_date < filters.start_date) return false;
      if (filters.end_date && tx.transaction_date > filters.end_date) return false;
      if (filters.year || filters.month) {
        const [y, m] = tx.transaction_date.split('-').map(Number);
        if (filters.year && y !== filters.year) return false;
        if (filters.month && m !== filters.month) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const catName = state.categories.find((c) => c.id === tx.category_id)?.name.toLowerCase() ?? '';
        const accName = state.accounts.find((a) => a.id === tx.account_id)?.name.toLowerCase() ?? '';
        const notes = tx.notes?.toLowerCase() ?? '';
        const ref = tx.reference_code.toLowerCase();
        if (!catName.includes(q) && !accName.includes(q) && !notes.includes(q) && !ref.includes(q)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);
}

export function computeDashboardSummary(
  state: DatabaseState,
  currentUserId: number,
  filters: DashboardFilters
): DashboardSummary {
  const visibleAccounts = state.accounts
    .filter((a) => !a.deleted_at && a.is_active)
    .filter((a) => canViewRecord(state, currentUserId, a))
    .filter((a) => {
      if (filters.space && filters.space !== 'all' && a.space !== filters.space) return false;
      if (filters.member_id && filters.member_id !== 'all' && a.user_id !== filters.member_id) return false;
      if (filters.account_id && filters.account_id !== 'all' && a.id !== filters.account_id) return false;
      return true;
    });

  const total_balance = visibleAccounts.reduce((sum, a) => sum + Number(a.current_balance), 0);

  const monthTxs = filterTransactions(state, currentUserId, {
    month: filters.month,
    year: filters.year,
    space: filters.space,
    member_id: filters.member_id,
    account_id: filters.account_id,
  });

  // Rule: Transfers and non-consumptive asset allocations NEVER count as income or expense!
  const monthly_income = monthTxs
    .filter((t) => t.type === 'income' && !t.is_asset_allocation)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthly_expense = monthTxs
    .filter((t) => t.type === 'expense' && !t.is_asset_allocation)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthly_net = monthly_income - monthly_expense;

  const visibleSavings = state.savings_goals
    .filter((g) => canViewRecord(state, currentUserId, g))
    .filter((g) => !filters.space || filters.space === 'all' || g.space === filters.space)
    .map((g) => hydrateSavingsGoal(state, g.id)!)
    .filter(Boolean);

  const total_savings = visibleSavings.reduce((sum, g) => sum + Number(g.current_amount), 0);

  const visibleFunds = state.emergency_funds
    .filter((f) => canViewRecord(state, currentUserId, f))
    .filter((f) => !filters.space || filters.space === 'all' || f.space === filters.space)
    .map((f) => hydrateEmergencyFund(state, f.id)!)
    .filter(Boolean);

  const total_emergency_fund = visibleFunds.reduce((sum, f) => sum + Number(f.current_amount), 0);

  const visibleInvestments = state.investments
    .filter((i) => canViewRecord(state, currentUserId, i))
    .filter((i) => !filters.space || filters.space === 'all' || i.space === filters.space)
    .map((i) => hydrateInvestment(state, i.id)!)
    .filter(Boolean);

  const total_investment_value = visibleInvestments.reduce((sum, i) => sum + Number(i.current_value), 0);

  // Net worth = total liquid/account balances + total investments (note savings & emergency funds placed inside tracked accounts are already in total_balance; add only investment asset value to avoid double-counting bank accounts!)
  const total_net_worth = total_balance + total_investment_value;

  const budgets = computeBudgets(state, currentUserId, {
    month: filters.month,
    year: filters.year,
    space: filters.space,
  });

  const recent_transactions = monthTxs
    .slice(0, 6)
    .map((t) => hydrateTransaction(state, t));

  const upcoming_bills = state.bills
    .filter((b) => canViewRecord(state, currentUserId, b))
    .filter((b) => !filters.space || filters.space === 'all' || b.space === filters.space)
    .map((b) => hydrateBill(state, b.id)!)
    .filter((b) => b.status !== 'paid')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  return {
    total_balance,
    monthly_income,
    monthly_expense,
    monthly_net,
    total_savings,
    total_emergency_fund,
    total_investment_value,
    total_net_worth,
    budgets,
    recent_transactions,
    upcoming_bills,
    savings_goals: visibleSavings,
    emergency_fund: visibleFunds[0] ?? null,
  };
}

export function computeCashFlowSeries(
  state: DatabaseState,
  currentUserId: number,
  filters: DashboardFilters,
  monthsCount = 6
): CashFlowPoint[] {
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const points: CashFlowPoint[] = [];

  for (let offset = monthsCount - 1; offset >= 0; offset--) {
    let m = filters.month - offset;
    let y = filters.year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }

    const txs = filterTransactions(state, currentUserId, {
      month: m,
      year: y,
      space: filters.space,
      member_id: filters.member_id,
      account_id: filters.account_id,
    });

    const income = txs
      .filter((t) => t.type === 'income' && !t.is_asset_allocation)
      .reduce((s, t) => s + Number(t.amount), 0);

    const expense = txs
      .filter((t) => t.type === 'expense' && !t.is_asset_allocation)
      .reduce((s, t) => s + Number(t.amount), 0);

    points.push({
      label: `${shortMonths[m - 1]} ${String(y).slice(2)}`,
      month: m,
      year: y,
      income,
      expense,
      net: income - expense,
    });
  }

  return points;
}

export function computeExpenseCategories(
  state: DatabaseState,
  currentUserId: number,
  filters: DashboardFilters
): ExpenseCategoryPoint[] {
  const txs = filterTransactions(state, currentUserId, {
    month: filters.month,
    year: filters.year,
    space: filters.space,
    member_id: filters.member_id,
    account_id: filters.account_id,
    type: 'expense',
  }).filter((t) => !t.is_asset_allocation);

  const grouped = new Map<number, number>();
  let totalAll = 0;

  for (const tx of txs) {
    if (!tx.category_id) continue;
    const prev = grouped.get(tx.category_id) ?? 0;
    grouped.set(tx.category_id, prev + Number(tx.amount));
    totalAll += Number(tx.amount);
  }

  return Array.from(grouped.entries())
    .map(([categoryId, total]) => {
      const cat = state.categories.find((c) => c.id === categoryId);
      return {
        category_id: categoryId,
        category_name: cat?.name ?? 'Lainnya',
        color: cat?.color ?? '#64748b',
        total,
        percentage: totalAll > 0 ? Math.round((total / totalAll) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function hydrateFamily(state: DatabaseState, familyId: number): Family | null {
  const fam = state.families.find((f) => f.id === familyId);
  if (!fam) return null;

  const members = state.family_members
    .filter((m) => m.family_id === fam.id)
    .map((m) => {
      const user = state.users.find((u) => u.id === m.user_id);
      return {
        id: m.id,
        family_id: m.family_id,
        user_id: m.user_id,
        name: user?.name ?? 'Anggota',
        email: user?.email ?? '',
        avatar_url: user?.avatar_url ?? null,
        role: m.role,
        relationship: m.relationship ?? null,
        can_view_private: m.can_view_private,
        joined_at: m.joined_at,
      };
    });

  return {
    id: fam.id,
    name: fam.name,
    owner_id: fam.owner_id,
    description: fam.description,
    head_of_family: fam.head_of_family ?? null,
    city: fam.city ?? null,
    address: fam.address ?? null,
    phone: fam.phone ?? null,
    members,
    created_at: fam.created_at,
  };
}

export function generateAuthToken(): string {
  return `ff_tok_${crypto.randomBytes(32).toString('hex')}`;
}

export function computeAvailableYears(
  state: DatabaseState,
  currentUserId: number,
  referenceDate: Date = new Date()
): { years: number[]; data_years: number[]; current_year: number; current_month: number } {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const yearSet = new Set<number>();

  const pushYearFromDate = (dateStr?: string | null) => {
    if (!dateStr) return;
    const parsed = Number(dateStr.slice(0, 4));
    if (Number.isInteger(parsed) && parsed >= 1970 && parsed <= 2150) {
      yearSet.add(parsed);
    }
  };

  for (const tx of state.transactions) {
    if (!tx.deleted_at && canViewRecord(state, currentUserId, tx)) {
      pushYearFromDate(tx.transaction_date);
    }
  }
  for (const b of state.budgets) {
    if (canViewRecord(state, currentUserId, b) && Number.isInteger(b.year)) {
      yearSet.add(b.year);
    }
  }
  for (const bill of state.bills) {
    if (canViewRecord(state, currentUserId, bill)) {
      pushYearFromDate(bill.due_date);
    }
  }
  for (const goal of state.savings_goals) {
    if (canViewRecord(state, currentUserId, goal)) {
      pushYearFromDate(goal.start_date);
      pushYearFromDate(goal.target_date);
    }
  }

  const dataYears = Array.from(yearSet).sort((a, b) => a - b);
  const minYear = Math.min(currentYear - 5, ...(dataYears.length ? dataYears : [currentYear - 5]));
  const maxYear = Math.max(currentYear + 5, ...(dataYears.length ? dataYears : [currentYear + 5]));

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y += 1) {
    years.push(y);
  }

  return {
    years,
    data_years: dataYears,
    current_year: currentYear,
    current_month: currentMonth,
  };
}

export function computeMultiYearSummary(
  state: DatabaseState,
  currentUserId: number,
  startYear: number,
  endYear: number,
  space: SpaceType | 'all' = 'all'
): Array<{ year: number; income: number; expense: number; net: number; savings_rate: number }> {
  const from = Math.min(startYear, endYear);
  const to = Math.max(startYear, endYear);
  const points: Array<{ year: number; income: number; expense: number; net: number; savings_rate: number }> = [];

  for (let y = from; y <= to; y += 1) {
    const txs = filterTransactions(state, currentUserId, { year: y, space }).filter(
      (t) => !t.is_asset_allocation
    );
    const income = txs
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = txs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const net = income - expense;
    const savings_rate = income > 0 ? Math.round((net / income) * 1000) / 10 : 0;

    points.push({ year: y, income, expense, net, savings_rate });
  }

  return points;
}
