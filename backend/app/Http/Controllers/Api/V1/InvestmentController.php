<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreInvestmentRequest;
use App\Models\Category;
use App\Models\Investment;
use App\Policies\FinancialRecordPolicy;
use App\Services\InvestmentService;
use App\Services\ReportService;
use App\Services\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvestmentController extends ApiController
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly InvestmentService $service,
        private readonly TransactionService $transactionService,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $items = $this->reports->scopeVisible(Investment::query()->with('transactions'), $request->user())->get();

        return $this->success('Portofolio investasi berhasil dimuat', $items);
    }

    public function store(StoreInvestmentRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $familyId = $request->user()->families()->value('families.id');

        if (! $this->policy->canCreateInFamily($request->user(), $familyId)) {
            return $this->error('Role Viewer tidak diizinkan menambahkan aset investasi.', 403);
        }

        $totalCost = bcmul((string) $validated['units'], (string) $validated['buy_price_per_unit'], 2);

        $investment = DB::transaction(function () use ($request, $validated, $familyId, $totalCost) {
            if (! empty($validated['source_account_id'])) {
                $expenseCatId = Category::query()
                    ->where('type', 'expense')
                    ->where('name', 'Lainnya')
                    ->value('id')
                    ?? Category::query()->where('type', 'expense')->value('id');

                $this->transactionService->create($request->user(), [
                    'type' => 'expense',
                    'category_id' => $expenseCatId,
                    'account_id' => $validated['source_account_id'],
                    'amount' => $totalCost,
                    'space' => $validated['space'],
                    'transaction_date' => $validated['purchase_date'],
                    'notes' => 'Alokasi investasi awal: '.$validated['name'],
                    'is_asset_allocation' => true,
                ]);
            }

            unset($validated['source_account_id']);

            return Investment::query()->create([
                ...$validated,
                'user_id' => $request->user()->id,
                'family_id' => $familyId,
                'total_cost' => $totalCost,
                'price_source' => 'manual',
            ]);
        });

        return $this->success('Aset investasi berhasil ditambahkan', $investment->load('transactions'), 201);
    }

    public function show(Request $request, Investment $investment): JsonResponse
    {
        if (! $this->policy->view($request->user(), $investment)) {
            return $this->error('Akses ditolak.', 403);
        }

        return $this->success('Detail investasi berhasil dimuat', $investment->load('transactions'));
    }

    public function update(Request $request, Investment $investment): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $investment)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'current_market_price' => ['required', 'numeric', 'gte:0'],
        ]);

        $investment->update([
            'current_market_price' => $validated['current_market_price'],
            'price_source' => 'manual',
        ]);

        return $this->success('Harga pasar investasi berhasil diperbarui', $investment->fresh('transactions'));
    }

    public function transact(Request $request, Investment $investment): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $investment)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'type' => ['required', 'in:buy,sell,dividend'],
            'units' => ['required', 'numeric', 'gte:0'],
            'price_per_unit' => ['required', 'numeric', 'gt:0'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'transaction_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->service->recordTransaction($request->user(), $investment, $validated);

        return $this->success('Transaksi investasi berhasil dicatat', $updated, 201);
    }
}
