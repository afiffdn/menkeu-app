import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSeedState } from './seed';
import {
  canViewRecord,
  computeAvailableYears,
  computeDashboardSummary,
  computeMultiYearSummary,
  createTransaction,
  deleteTransaction,
  DomainError,
  recalculateAllAccountBalances,
  updateTransaction,
} from './ledger';

test('transfers move balance between accounts without counting as income or expense', () => {
  const state = createDemoSeedState();
  recalculateAllAccountBalances(state);

  const beforeSummary = computeDashboardSummary(state, 1, { month: 11, year: 2026 });
  const srcBefore = state.accounts.find((a) => a.id === 1)!.current_balance;
  const dstBefore = state.accounts.find((a) => a.id === 3)!.current_balance;

  const { transaction, deduplicated } = createTransaction(state, 1, {
    type: 'transfer',
    account_id: 1,
    to_account_id: 3,
    amount: 500000,
    transaction_date: '2026-11-17',
    notes: 'Tarik tunai kas rumah',
    idempotency_key: 'test-transfer-1',
  });

  assert.equal(deduplicated, false);
  assert.equal(transaction.type, 'transfer');
  assert.equal(state.accounts.find((a) => a.id === 1)!.current_balance, srcBefore - 500000);
  assert.equal(state.accounts.find((a) => a.id === 3)!.current_balance, dstBefore + 500000);

  const afterSummary = computeDashboardSummary(state, 1, { month: 11, year: 2026 });
  assert.equal(afterSummary.monthly_income, beforeSummary.monthly_income);
  assert.equal(afterSummary.monthly_expense, beforeSummary.monthly_expense);
  assert.equal(afterSummary.total_balance, beforeSummary.total_balance);
});

test('idempotency key prevents duplicate transaction creation on retries', () => {
  const state = createDemoSeedState();
  recalculateAllAccountBalances(state);

  const balBefore = state.accounts.find((a) => a.id === 1)!.current_balance;
  const first = createTransaction(state, 1, {
    type: 'expense',
    category_id: 8,
    account_id: 1,
    amount: 125000,
    transaction_date: '2026-11-17',
    notes: 'Makan siang',
    idempotency_key: 'idem-abc-123',
  });
  const second = createTransaction(state, 1, {
    type: 'expense',
    category_id: 8,
    account_id: 1,
    amount: 125000,
    transaction_date: '2026-11-17',
    notes: 'Makan siang',
    idempotency_key: 'idem-abc-123',
  });

  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(first.transaction.id, second.transaction.id);
  assert.equal(state.accounts.find((a) => a.id === 1)!.current_balance, balBefore - 125000);
});

test('updating and deleting a transaction accurately recalculates balances and monthly reports', () => {
  const state = createDemoSeedState();
  recalculateAllAccountBalances(state);

  const startBal = state.accounts.find((a) => a.id === 1)!.current_balance;
  const { transaction } = createTransaction(state, 1, {
    type: 'expense',
    category_id: 8,
    account_id: 1,
    amount: 200000,
    transaction_date: '2026-11-17',
    notes: 'Belanja sayur',
  });
  assert.equal(state.accounts.find((a) => a.id === 1)!.current_balance, startBal - 200000);

  updateTransaction(state, 1, transaction.id, { amount: 350000 });
  assert.equal(state.accounts.find((a) => a.id === 1)!.current_balance, startBal - 350000);

  deleteTransaction(state, 1, transaction.id);
  assert.equal(state.accounts.find((a) => a.id === 1)!.current_balance, startBal);
});

test('private space isolation blocks other family members without explicit permission', () => {
  const state = createDemoSeedState();
  const sariPrivateAccount = state.accounts.find((a) => a.id === 6)!; // user_id 2, space 'pribadi'
  const sharedFamilyAccount = state.accounts.find((a) => a.id === 1)!; // user_id 1, space 'keluarga'

  assert.equal(canViewRecord(state, 1, sariPrivateAccount), false);
  assert.equal(canViewRecord(state, 3, sariPrivateAccount), false);
  assert.equal(canViewRecord(state, 3, sharedFamilyAccount), true);
  assert.equal(canViewRecord(state, 2, sariPrivateAccount), true);
});

test('expense exceeding account balance is rejected cleanly', () => {
  const state = createDemoSeedState();
  recalculateAllAccountBalances(state);

  assert.throws(
    () =>
      createTransaction(state, 1, {
        type: 'expense',
        category_id: 8,
        account_id: 3, // Dompet Tunai
        amount: 999999999,
        transaction_date: '2026-11-17',
      }),
    (err: unknown) => err instanceof DomainError && err.status === 422
  );
});

test('computeAvailableYears and computeMultiYearSummary work dynamically across long-term years', () => {
  const state = createDemoSeedState();
  recalculateAllAccountBalances(state);

  createTransaction(state, 1, {
    type: 'income',
    category_id: 1,
    account_id: 1,
    amount: 25000000,
    transaction_date: '2032-03-10',
    notes: 'Proyeksi tahun 2032',
  });

  const meta = computeAvailableYears(state, 1, new Date(2028, 0, 15));
  assert.ok(meta.data_years.includes(2032));
  assert.ok(meta.years.includes(2023));
  assert.ok(meta.years.includes(2033));
  assert.equal(meta.current_year, 2028);

  const series = computeMultiYearSummary(state, 1, 2026, 2032, 'all');
  assert.equal(series.length, 7);
  const y2032 = series.find((p) => p.year === 2032)!;
  assert.equal(y2032.income, 25000000);
  assert.equal(y2032.savings_rate, 100);
});

test('newly registered independent user cannot view any data from existing users or families', () => {
  const state = createDemoSeedState();
  recalculateAllAccountBalances(state);

  const newUserId = 99;
  const newFamilyId = 99;
  state.users.push({
    id: newUserId,
    name: 'Budi Santoso',
    email: 'budi@contoh.id',
    password_hash: 'hash',
    avatar_url: null,
    currency: 'IDR',
    created_at: new Date().toISOString(),
  });
  state.families.push({
    id: newFamilyId,
    name: 'Keluarga Santoso',
    owner_id: newUserId,
    description: null,
    created_at: new Date().toISOString(),
  });
  state.family_members.push({
    id: 99,
    family_id: newFamilyId,
    user_id: newUserId,
    role: 'owner',
    can_view_private: false,
    joined_at: new Date().toISOString(),
  });

  const existingSharedAccount = state.accounts.find((a) => a.id === 1)!;
  assert.equal(canViewRecord(state, newUserId, existingSharedAccount), false);

  const summary = computeDashboardSummary(state, newUserId, { month: 11, year: 2026 });
  assert.equal(summary.total_balance, 0);
  assert.equal(summary.monthly_income, 0);
  assert.equal(summary.monthly_expense, 0);
  assert.equal(summary.recent_transactions.length, 0);
  assert.equal(summary.budgets.length, 0);
  assert.equal(summary.savings_goals.length, 0);
  assert.equal(summary.upcoming_bills.length, 0);
});
