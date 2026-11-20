<?php

namespace App\Services;

use App\Models\EmergencyFund;
use App\Models\EmergencyFundTransaction;
use App\Models\SavingsContribution;
use App\Models\SavingsGoal;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class SavingsAndEmergencyService
{
    public function __construct(private readonly TransactionService $transactionService) {}

    public function addSavingsContribution(User $user, SavingsGoal $goal, array $data): SavingsGoal
    {
        return DB::transaction(function () use ($user, $goal, $data) {
            if (! empty($data['source_account_id']) && ! empty($goal->account_id) && (int) $data['source_account_id'] !== (int) $goal->account_id) {
                $this->transactionService->create($user, [
                    'type' => 'transfer',
                    'account_id' => $data['source_account_id'],
                    'to_account_id' => $goal->account_id,
                    'amount' => $data['amount'],
                    'space' => $goal->space,
                    'transaction_date' => $data['contribution_date'],
                    'notes' => 'Setoran tabungan: '.$goal->name,
                    'is_asset_allocation' => true,
                ]);
            }

            SavingsContribution::query()->create([
                'savings_goal_id' => $goal->id,
                'user_id' => $user->id,
                'source_account_id' => $data['source_account_id'] ?? null,
                'amount' => $data['amount'],
                'contribution_date' => $data['contribution_date'],
                'notes' => $data['notes'] ?? null,
            ]);

            $goal->current_amount = bcadd((string) $goal->current_amount, (string) $data['amount'], 2);
            if (bccomp((string) $goal->current_amount, (string) $goal->target_amount, 2) >= 0) {
                $goal->status = 'completed';
            }
            $goal->save();

            return $goal->fresh('contributions');
        });
    }

    public function recordEmergencyTransaction(User $user, EmergencyFund $fund, array $data): EmergencyFund
    {
        return DB::transaction(function () use ($user, $fund, $data) {
            $primaryFundAccountId = $fund->account_ids[0] ?? null;
            $type = $data['type'];

            if ($type === 'deposit' && ! empty($data['account_id']) && $primaryFundAccountId && (int) $data['account_id'] !== (int) $primaryFundAccountId) {
                $this->transactionService->create($user, [
                    'type' => 'transfer',
                    'account_id' => $data['account_id'],
                    'to_account_id' => $primaryFundAccountId,
                    'amount' => $data['amount'],
                    'space' => $fund->space,
                    'transaction_date' => $data['transaction_date'],
                    'notes' => 'Setoran Dana Darurat: '.$fund->name,
                    'is_asset_allocation' => true,
                ]);
            }

            EmergencyFundTransaction::query()->create([
                'emergency_fund_id' => $fund->id,
                'user_id' => $user->id,
                'type' => $type,
                'account_id' => $data['account_id'] ?? $primaryFundAccountId,
                'amount' => $data['amount'],
                'transaction_date' => $data['transaction_date'],
                'notes' => $data['notes'] ?? null,
            ]);

            $fund->current_amount = $type === 'deposit'
                ? bcadd((string) $fund->current_amount, (string) $data['amount'], 2)
                : bcsub((string) $fund->current_amount, (string) $data['amount'], 2);
            $fund->save();

            return $fund->fresh('transactions');
        });
    }
}
