<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\TransactionResource;
use App\Models\Transaction;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends ApiController
{
    public function __construct(private readonly ReportService $reports) {}

    public function monthly(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');
        $memberId = $request->query('member_id') !== 'all' ? $request->integer('member_id') ?: null : null;
        $accountId = $request->query('account_id') !== 'all' ? $request->integer('account_id') ?: null : null;

        $summary = $this->reports->getDashboardSummary($request->user(), $month, $year, $space, $memberId, $accountId);
        $expenseCategories = $this->reports->getCategoryBreakdown($request->user(), 'expense', $month, $year, $space, $memberId, $accountId);

        $transactions = $this->reports->scopeVisible(Transaction::query()->with(['category', 'account', 'toAccount', 'user']), $request->user(), $space)
            ->whereYear('transaction_date', $year)
            ->whereMonth('transaction_date', $month)
            ->when($memberId, fn ($q) => $q->where('user_id', $memberId))
            ->when($accountId, fn ($q) => $q->where(fn ($aq) => $aq->where('account_id', $accountId)->orWhere('to_account_id', $accountId)))
            ->latest('transaction_date')
            ->latest('id')
            ->get();

        return $this->success('Laporan bulanan berhasil dimuat', [
            'period' => ['month' => $month, 'year' => $year],
            'summary' => $summary,
            'expense_categories' => $expenseCategories,
            'transactions' => TransactionResource::collection($transactions),
        ]);
    }

    public function yearly(Request $request): JsonResponse
    {
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');

        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $base = $this->reports->scopeVisible(Transaction::query(), $request->user(), $space)
                ->whereYear('transaction_date', $year)
                ->whereMonth('transaction_date', $m)
                ->where('is_asset_allocation', false);

            $income = (float) (clone $base)->where('type', 'income')->sum('amount');
            $expense = (float) (clone $base)->where('type', 'expense')->sum('amount');

            $months[] = [
                'month' => $m,
                'year' => $year,
                'income' => $income,
                'expense' => $expense,
                'net' => $income - $expense,
            ];
        }

        $totalIncome = array_sum(array_column($months, 'income'));
        $totalExpense = array_sum(array_column($months, 'expense'));

        return $this->success('Laporan tahunan berhasil dimuat', [
            'year' => $year,
            'total_income' => $totalIncome,
            'total_expense' => $totalExpense,
            'net_savings' => $totalIncome - $totalExpense,
            'months' => $months,
        ]);
    }

    public function cashFlow(Request $request): JsonResponse
    {
        return app(DashboardController::class)->cashFlow($request);
    }

    public function expenses(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');
        $memberId = $request->query('member_id') !== 'all' ? $request->integer('member_id') ?: null : null;
        $accountId = $request->query('account_id') !== 'all' ? $request->integer('account_id') ?: null : null;
        $startDate = $request->query('start_date');
        $endDate = $request->query('end_date');

        $categories = $this->reports->getCategoryBreakdown(
            $request->user(),
            'expense',
            $month,
            $year,
            $space,
            $memberId,
            $accountId,
            $startDate,
            $endDate,
        );

        $transactions = $this->reports->scopeVisible(Transaction::query()->with(['category', 'account', 'user']), $request->user(), $space)
            ->where('type', 'expense')
            ->where('is_asset_allocation', false)
            ->when($startDate && $endDate, function ($q) use ($startDate, $endDate) {
                $q->whereDate('transaction_date', '>=', $startDate)->whereDate('transaction_date', '<=', $endDate);
            }, function ($q) use ($year, $month) {
                $q->whereYear('transaction_date', $year)->whereMonth('transaction_date', $month);
            })
            ->when($memberId, fn ($q) => $q->where('user_id', $memberId))
            ->when($accountId, fn ($q) => $q->where('account_id', $accountId))
            ->latest('transaction_date')
            ->get();

        return $this->success('Laporan pengeluaran berhasil dimuat', [
            'categories' => $categories,
            'transactions' => TransactionResource::collection($transactions),
        ]);
    }

    public function income(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');
        $memberId = $request->query('member_id') !== 'all' ? $request->integer('member_id') ?: null : null;
        $accountId = $request->query('account_id') !== 'all' ? $request->integer('account_id') ?: null : null;
        $startDate = $request->query('start_date');
        $endDate = $request->query('end_date');

        $categories = $this->reports->getCategoryBreakdown(
            $request->user(),
            'income',
            $month,
            $year,
            $space,
            $memberId,
            $accountId,
            $startDate,
            $endDate,
        );

        $transactions = $this->reports->scopeVisible(Transaction::query()->with(['category', 'account', 'user']), $request->user(), $space)
            ->where('type', 'income')
            ->where('is_asset_allocation', false)
            ->when($startDate && $endDate, function ($q) use ($startDate, $endDate) {
                $q->whereDate('transaction_date', '>=', $startDate)->whereDate('transaction_date', '<=', $endDate);
            }, function ($q) use ($year, $month) {
                $q->whereYear('transaction_date', $year)->whereMonth('transaction_date', $month);
            })
            ->when($memberId, fn ($q) => $q->where('user_id', $memberId))
            ->when($accountId, fn ($q) => $q->where('account_id', $accountId))
            ->latest('transaction_date')
            ->get();

        return $this->success('Laporan pemasukan berhasil dimuat', [
            'categories' => $categories,
            'transactions' => TransactionResource::collection($transactions),
        ]);
    }

    public function availableYears(Request $request): JsonResponse
    {
        $currentYear = (int) now()->year;
        $currentMonth = (int) now()->month;

        $txYears = $this->reports->scopeVisible(Transaction::query(), $request->user(), 'all')
            ->selectRaw('DISTINCT YEAR(transaction_date) as yr')
            ->pluck('yr')
            ->map(fn ($y) => (int) $y)
            ->filter(fn (int $y) => $y >= 1970 && $y <= 2150)
            ->values()
            ->all();

        sort($txYears);
        $dataYears = array_values(array_unique($txYears));
        $minYear = min([$currentYear - 5, ...($dataYears ?: [$currentYear - 5])]);
        $maxYear = max([$currentYear + 5, ...($dataYears ?: [$currentYear + 5])]);

        return $this->success('Rentang tahun tersedia berhasil dimuat', [
            'years' => range($minYear, $maxYear),
            'data_years' => $dataYears,
            'current_year' => $currentYear,
            'current_month' => $currentMonth,
        ]);
    }

    public function multiYear(Request $request): JsonResponse
    {
        $nowYear = (int) now()->year;
        $rawStart = $request->integer('start_year', $nowYear - 4);
        $rawEnd = $request->integer('end_year', $nowYear);
        $startYear = min($rawStart, $rawEnd);
        $endYear = max($rawStart, $rawEnd);
        $space = $request->query('space', 'all');

        $series = [];
        for ($y = $startYear; $y <= $endYear; $y++) {
            $base = $this->reports->scopeVisible(Transaction::query(), $request->user(), $space)
                ->whereYear('transaction_date', $y)
                ->where('is_asset_allocation', false);

            $income = (float) (clone $base)->where('type', 'income')->sum('amount');
            $expense = (float) (clone $base)->where('type', 'expense')->sum('amount');
            $net = $income - $expense;
            $savingsRate = $income > 0 ? round(($net / $income) * 100, 1) : 0.0;

            $series[] = [
                'year' => $y,
                'income' => $income,
                'expense' => $expense,
                'net' => $net,
                'savings_rate' => $savingsRate,
            ];
        }

        return $this->success('Laporan perbandingan multi-tahun berhasil dimuat', [
            'start_year' => $startYear,
            'end_year' => $endYear,
            'series' => $series,
        ]);
    }
}
