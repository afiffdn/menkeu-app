<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Policies\FinancialRecordPolicy;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class TransactionService
{
    public function __construct(
        private readonly AccountBalanceService $balanceService,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function create(User $user, array $data): array
    {
        $idemKey = $data['idempotency_key'] ?? null;
        if ($idemKey) {
            $existing = Transaction::query()
                ->where('user_id', $user->id)
                ->where('idempotency_key', $idemKey)
                ->first();
            if ($existing) {
                return [
                    'transaction' => $existing->load(['category', 'account', 'toAccount', 'attachment', 'user']),
                    'deduplicated' => true,
                ];
            }
        }

        return DB::transaction(function () use ($user, $data, $idemKey) {
            $account = Account::query()->whereKey($data['account_id'])->lockForUpdate()->firstOrFail();

            if (! $this->policy->view($user, $account) || ! $account->is_active) {
                throw new AccessDeniedHttpException('Anda tidak memiliki akses ke akun asal ini atau akun tidak aktif.');
            }

            if (! $this->policy->canCreateInFamily($user, $account->family_id)) {
                throw new AccessDeniedHttpException('Role Viewer hanya memiliki akses lihat dan tidak dapat mencatat transaksi.');
            }

            $type = $data['type'];
            $amount = (string) $data['amount'];

            $toAccount = null;
            if ($type === 'transfer') {
                if (empty($data['to_account_id']) || (int) $data['to_account_id'] === (int) $account->id) {
                    throw ValidationException::withMessages([
                        'to_account_id' => ['Akun tujuan harus berbeda dari akun asal.'],
                    ]);
                }
                $toAccount = Account::query()->whereKey($data['to_account_id'])->lockForUpdate()->firstOrFail();
                if (! $this->policy->view($user, $toAccount) || ! $toAccount->is_active) {
                    throw new AccessDeniedHttpException('Akun tujuan tidak valid atau tidak aktif.');
                }
            } else {
                $category = Category::query()->find($data['category_id'] ?? null);
                if (! $category || $category->type !== $type) {
                    throw ValidationException::withMessages([
                        'category_id' => ['Kategori tidak sesuai dengan jenis transaksi.'],
                    ]);
                }
            }

            $currentBal = $this->balanceService->recalculate($account->id);
            if (in_array($type, ['expense', 'transfer'], true) && bccomp($currentBal, $amount, 2) < 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Saldo akun tidak mencukupi untuk transaksi ini.'],
                ]);
            }

            $nextSeq = (Transaction::withTrashed()->max('id') ?? 0) + 1;
            $dateCode = str_replace('-', '', substr($data['transaction_date'], 0, 7));

            $transaction = Transaction::query()->create([
                'reference_code' => sprintf('TRX-%s-%03d', $dateCode, $nextSeq),
                'user_id' => $user->id,
                'family_id' => $account->family_id,
                'type' => $type,
                'category_id' => $type === 'transfer' ? null : $data['category_id'],
                'account_id' => $account->id,
                'to_account_id' => $toAccount?->id,
                'amount' => $amount,
                'space' => $data['space'] ?? $account->space,
                'transaction_date' => $data['transaction_date'],
                'notes' => $data['notes'] ?? null,
                'idempotency_key' => $idemKey,
                'attachment_id' => $data['attachment_id'] ?? null,
                'is_asset_allocation' => (bool) ($data['is_asset_allocation'] ?? ($type === 'transfer')),
            ]);

            $this->balanceService->recalculate($account->id);
            if ($toAccount) {
                $this->balanceService->recalculate($toAccount->id);
            }

            return [
                'transaction' => $transaction->load(['category', 'account', 'toAccount', 'attachment', 'user']),
                'deduplicated' => false,
            ];
        });
    }

    public function update(User $user, Transaction $transaction, array $data): Transaction
    {
        if (! $this->policy->modify($user, $transaction)) {
            throw new AccessDeniedHttpException('Anda tidak memiliki izin mengubah transaksi ini.');
        }

        return DB::transaction(function () use ($transaction, $data) {
            $oldAccountId = $transaction->account_id;
            $oldToAccountId = $transaction->to_account_id;

            $transaction->fill($data);
            if ($transaction->type === 'transfer') {
                $transaction->category_id = null;
                $transaction->is_asset_allocation = true;
            }
            $transaction->save();

            $affected = array_unique(array_filter([
                $oldAccountId,
                $oldToAccountId,
                $transaction->account_id,
                $transaction->to_account_id,
            ]));

            foreach ($affected as $accId) {
                $bal = $this->balanceService->recalculate((int) $accId);
                if (bccomp($bal, '0.00', 2) < 0) {
                    throw ValidationException::withMessages([
                        'amount' => ['Perubahan transaksi menyebabkan saldo akun menjadi negatif.'],
                    ]);
                }
            }

            return $transaction->fresh(['category', 'account', 'toAccount', 'attachment', 'user']);
        });
    }

    public function delete(User $user, Transaction $transaction): void
    {
        if (! $this->policy->modify($user, $transaction)) {
            throw new AccessDeniedHttpException('Anda tidak memiliki izin menghapus transaksi ini.');
        }

        DB::transaction(function () use ($transaction) {
            $accountId = $transaction->account_id;
            $toAccountId = $transaction->to_account_id;

            $transaction->delete();

            $this->balanceService->recalculate($accountId);
            if ($toAccountId) {
                $this->balanceService->recalculate($toAccountId);
            }
        });
    }
}
