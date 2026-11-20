<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\TransactionResource;
use App\Models\Transaction;
use App\Services\ReportService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends ApiController
{
    public function __construct(private readonly ReportService $reports) {}

    public function summary(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');
        $memberId = $request->query('member_id') !== 'all' ? $request->integer('member_id') ?: null : null;
        $accountId = $request->query('account_id') !== 'all' ? $request->integer('account_id') ?: null : null;

        $data = $this->reports->getDashboardSummary($request->user(), $month, $year, $space, $memberId, $accountId);

        return $this->success('Ringkasan dashboard berhasil dimuat', $data);
    }

    public function cashFlow(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $monthsCount = min(24, max(1, (int) $request->integer('months', 6)));
        $space = $request->query('space', 'all');

        $anchor = Carbon::createFromDate($year, $month, 1);
        $series = [];

        for ($i = $monthsCount - 1; $i >= 0; $i--) {
            $cursor = $anchor->copy()->subMonths($i);
            $txs = $this->reports->scopeVisible(Transaction::query(), $request->user(), $space)
                ->whereYear('transaction_date', $cursor->year)
                ->whereMonth('transaction_date', $cursor->month)
                ->where('is_asset_allocation', false);

            $income = (float) (clone $txs)->where('type', 'income')->sum('amount');
            $expense = (float) (clone $txs)->where('type', 'expense')->sum('amount');

            $series[] = [
                'label' => $cursor->translatedFormat('M y'),
                'month' => $cursor->month,
                'year' => $cursor->year,
                'income' => $income,
                'expense' => $expense,
                'net' => $income - $expense,
            ];
        }

        return $this->success('Grafik arus kas berhasil dimuat', $series);
    }

    public function expenseCategories(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');

        $rows = $this->reports->scopeVisible(Transaction::query()->with('category'), $request->user(), $space)
            ->where('type', 'expense')
            ->where('is_asset_allocation', false)
            ->whereYear('transaction_date', $year)
            ->whereMonth('transaction_date', $month)
            ->get()
            ->groupBy('category_id');

        $grandTotal = $rows->flatten()->sum('amount');

        $result = $rows->map(function ($items, $categoryId) use ($grandTotal) {
            $cat = $items->first()->category;
            $sum = (float) $items->sum('amount');

            return [
                'category_id' => (int) $categoryId,
                'category_name' => $cat?->name ?? 'Lainnya',
                'color' => $cat?->color ?? '#64748b',
                'total' => $sum,
                'percentage' => $grandTotal > 0 ? round(($sum / $grandTotal) * 100, 1) : 0,
            ];
        })->sortByDesc('total')->values();

        return $this->success('Kategori pengeluaran berhasil dimuat', $result);
    }

    public function recentTransactions(Request $request): JsonResponse
    {
        $space = $request->query('space', 'all');
        $txs = $this->reports->scopeVisible(Transaction::query()->with(['category', 'account', 'toAccount', 'user']), $request->user(), $space)
            ->latest('transaction_date')
            ->limit(8)
            ->get();

        return $this->success('Transaksi terbaru berhasil dimuat', TransactionResource::collection($txs));
    }
}
