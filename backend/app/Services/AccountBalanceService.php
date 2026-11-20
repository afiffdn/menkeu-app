<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Transaction;

class AccountBalanceService
{
    public function recalculate(int $accountId): string
    {
        $account = Account::query()->whereKey($accountId)->lockForUpdate()->firstOrFail();

        $income = (string) Transaction::query()
            ->whereNull('deleted_at')
            ->where('type', 'income')
            ->where('account_id', $accountId)
            ->sum('amount');

        $expense = (string) Transaction::query()
            ->whereNull('deleted_at')
            ->where('type', 'expense')
            ->where('account_id', $accountId)
            ->sum('amount');

        $transferOut = (string) Transaction::query()
            ->whereNull('deleted_at')
            ->where('type', 'transfer')
            ->where('account_id', $accountId)
            ->sum('amount');

        $transferIn = (string) Transaction::query()
            ->whereNull('deleted_at')
            ->where('type', 'transfer')
            ->where('to_account_id', $accountId)
            ->sum('amount');

        $balance = bcadd((string) $account->initial_balance, $income, 2);
        $balance = bcsub($balance, $expense, 2);
        $balance = bcsub($balance, $transferOut, 2);
        $balance = bcadd($balance, $transferIn, 2);

        $account->current_balance = $balance;
        $account->save();

        return $balance;
    }
}
