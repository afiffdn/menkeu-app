<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Bill;
use App\Models\Budget;
use App\Models\EmergencyFund;
use App\Models\FamilyMember;
use App\Models\Investment;
use App\Models\SavingsGoal;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ReportService
{
    public function scopeVisible(Builder $query, User $user, ?string $space = null): Builder
    {
        $familyIds = FamilyMember::query()->where('user_id', $user->id)->pluck('family_id')->all();
        $privilegedFamilyIds = FamilyMember::query()
            ->where('user_id', $user->id)
            ->where('can_view_private', true)
            ->whereIn('role', ['owner', 'admin'])
            ->pluck('family_id')
            ->all();

        $query->where(function (Builder $q) use ($user, $familyIds, $privilegedFamilyIds) {
            $q->where('user_id', $user->id);

            if (! empty($familyIds)) {
                $q->orWhere(function (Builder $fq) use ($familyIds) {
                    $fq->whereIn('family_id', $familyIds)->whereIn('space', ['keluarga', 'anak']);
                });
            }

            if (! empty($privilegedFamilyIds)) {
                $q->orWhere(function (Builder $pq) use ($privilegedFamilyIds) {
                    $pq->whereIn('family_id', $privilegedFamilyIds)->where('space', 'pribadi');
                });
            }
        });

        if ($space && $space !== 'all') {
            $query->where('space', $space);
        }

        return $query;
    }

    public function getDashboardSummary(User $user, int $month, int $year, ?string $space = 'all', ?int $memberId = null, ?int $accountId = null): array
    {
        $accounts = $this->scopeVisible(Account::query()->where('is_active', true), $user, $space)
            ->when($memberId, fn ($q) => $q->where('user_id', $memberId))
            ->when($accountId, fn ($q) => $q->where('id', $accountId))
            ->get();

        $totalBalance = $accounts->sum('current_balance');

        $txQuery = $this->scopeVisible(Transaction::query(), $user, $space)
            ->whereYear('transaction_date', $year)
            ->whereMonth('transaction_date', $month)
            ->when($memberId, fn ($q) => $q->where('user_id', $memberId))
            ->when($accountId, fn ($q) => $q->where(function ($aq) use ($accountId) {
                $aq->where('account_id', $accountId)->orWhere('to_account_id', $accountId);
            }));

        $monthlyIncome = (clone $txQuery)->where('type', 'income')->where('is_asset_allocation', false)->sum('amount');
        $monthlyExpense = (clone $txQuery)->where('type', 'expense')->where('is_asset_allocation', false)->sum('amount');

        $savings = $this->scopeVisible(SavingsGoal::query(), $user, $space)->get();
        $emergencyFunds = $this->scopeVisible(EmergencyFund::query(), $user, $space)->get();
        $investments = $this->scopeVisible(Investment::query(), $user, $space)->get();
        $investmentValue = $investments->sum(fn ($i) => (float) $i->current_value);

        return [
            'total_balance' => (float) $totalBalance,
            'monthly_income' => (float) $monthlyIncome,
            'monthly_expense' => (float) $monthlyExpense,
            'monthly_net' => (float) ($monthlyIncome - $monthlyExpense),
            'total_savings' => (float) $savings->sum('current_amount'),
            'total_emergency_fund' => (float) $emergencyFunds->sum('current_amount'),
            'total_investment_value' => (float) $investmentValue,
            'total_net_worth' => (float) ($totalBalance + $investmentValue),
            'budgets' => $this->computeBudgets($user, $month, $year, $space),
            'recent_transactions' => (clone $txQuery)->with(['category', 'account', 'toAccount', 'user'])->latest('transaction_date')->latest('id')->limit(6)->get(),
            'upcoming_bills' => $this->scopeVisible(Bill::query()->where('status', '!=', 'paid'), $user, $space)->orderBy('due_date')->limit(5)->get(),
            'savings_goals' => $savings,
            'emergency_fund' => $emergencyFunds->first(),
        ];
    }

    public function getCategoryBreakdown(
        User $user,
        string $type,
        int $month,
        int $year,
        ?string $space = 'all',
        ?int $memberId = null,
        ?int $accountId = null,
        ?string $startDate = null,
        ?string $endDate = null,
    ): array {
        $rows = $this->scopeVisible(Transaction::query()->with('category'), $user, $space)
            ->where('type', $type)
            ->where('is_asset_allocation', false)
            ->when($startDate && $endDate, function ($q) use ($startDate, $endDate) {
                $q->whereDate('transaction_date', '>=', $startDate)->whereDate('transaction_date', '<=', $endDate);
            }, function ($q) use ($year, $month) {
                $q->whereYear('transaction_date', $year)->whereMonth('transaction_date', $month);
            })
            ->when($memberId, fn ($q) => $q->where('user_id', $memberId))
            ->when($accountId, fn ($q) => $q->where('account_id', $accountId))
            ->get()
            ->groupBy('category_id');

        $grandTotal = $rows->flatten()->sum('amount');

        return $rows->map(function ($items, $categoryId) use ($grandTotal) {
            $cat = $items->first()->category;
            $sum = (float) $items->sum('amount');

            return [
                'category_id' => (int) $categoryId,
                'category_name' => $cat?->name ?? 'Lainnya',
                'color' => $cat?->color ?? '#64748b',
                'total' => $sum,
                'percentage' => $grandTotal > 0 ? round(($sum / $grandTotal) * 100, 1) : 0,
            ];
        })->sortByDesc('total')->values()->all();
    }

    public function computeBudgets(User $user, int $month, int $year, ?string $space = 'all'): array
    {
        $budgets = $this->scopeVisible(Budget::query()->with('category'), $user, $space)
            ->where('year', $year)
            ->where(function ($q) use ($month) {
                $q->where('period', 'yearly')->orWhere(function ($mq) use ($month) {
                    $mq->where('period', 'monthly')->where('month', $month);
                });
            })
            ->get();

        return $budgets->map(function (Budget $b) use ($user) {
            $spentQuery = $this->scopeVisible(Transaction::query(), $user, $b->space)
                ->where('type', 'expense')
                ->where('is_asset_allocation', false)
                ->where('category_id', $b->category_id)
                ->whereYear('transaction_date', $b->year)
                ->when($b->period === 'monthly', fn ($q) => $q->whereMonth('transaction_date', $b->month));

            if ($b->space === 'pribadi') {
                $spentQuery->where('user_id', $b->user_id);
            } elseif (! empty($b->family_id)) {
                $spentQuery->where('family_id', $b->family_id);
            }

            $spent = $spentQuery->sum('amount');
            $limit = (float) $b->amount_limit;
            $pct = $limit > 0 ? round(((float) $spent / $limit) * 100, 1) : 0;

            return [
                'id' => $b->id,
                'category_id' => $b->category_id,
                'category_name' => $b->category?->name,
                'period' => $b->period,
                'month' => $b->month,
                'year' => $b->year,
                'space' => $b->space,
                'amount_limit' => $limit,
                'spent_amount' => (float) $spent,
                'remaining_amount' => max(0, $limit - (float) $spent),
                'usage_percentage' => $pct,
                'status' => $pct > 100 ? 'exceeded' : ($pct >= 80 ? 'warning' : 'safe'),
            ];
        })->values()->all();
    }
}
