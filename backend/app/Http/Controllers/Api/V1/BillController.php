<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreBillRequest;
use App\Models\Bill;
use App\Models\BillPayment;
use App\Models\Category;
use App\Policies\FinancialRecordPolicy;
use App\Services\ReportService;
use App\Services\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BillController extends ApiController
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly TransactionService $transactionService,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $bills = $this->reports->scopeVisible(Bill::query()->with(['category', 'account', 'payments']), $request->user())
            ->orderBy('due_date')
            ->get();

        return $this->success('Daftar tagihan berhasil dimuat', $bills);
    }

    public function store(StoreBillRequest $request): JsonResponse
    {
        $familyId = $request->user()->families()->value('families.id');
        if (! $this->policy->canCreateInFamily($request->user(), $familyId)) {
            return $this->error('Role Viewer tidak diizinkan menambahkan tagihan.', 403);
        }

        $bill = Bill::query()->create([
            ...$request->validated(),
            'user_id' => $request->user()->id,
            'family_id' => $familyId,
            'status' => 'unpaid',
        ]);

        return $this->success('Tagihan berhasil ditambahkan', $bill->load(['category', 'account', 'payments']), 201);
    }

    public function update(Request $request, Bill $bill): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $bill)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'amount' => ['sometimes', 'numeric', 'gt:0'],
            'due_date' => ['sometimes', 'date'],
            'frequency' => ['sometimes', 'in:once,weekly,monthly,yearly'],
            'status' => ['sometimes', 'in:unpaid,paid,overdue'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
        ]);

        $bill->update($validated);

        return $this->success('Tagihan berhasil diperbarui', $bill->fresh(['category', 'account', 'payments']));
    }

    public function recordPayment(Request $request, Bill $bill): JsonResponse
    {
        if (! $this->policy->view($request->user(), $bill) || ! $this->policy->canCreateInFamily($request->user(), $bill->family_id)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'amount_paid' => ['required', 'numeric', 'gt:0'],
            'paid_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = DB::transaction(function () use ($request, $bill, $validated) {
            $fallbackCatId = $bill->category_id
                ?? Category::query()->where('type', 'expense')->where('name', 'Tagihan')->value('id')
                ?? Category::query()->where('type', 'expense')->value('id');

            $this->transactionService->create($request->user(), [
                'type' => 'expense',
                'category_id' => $fallbackCatId,
                'account_id' => $validated['account_id'],
                'amount' => $validated['amount_paid'],
                'space' => $bill->space,
                'transaction_date' => $validated['paid_date'],
                'notes' => 'Pembayaran Tagihan: '.$bill->name,
            ]);

            BillPayment::query()->create([
                'bill_id' => $bill->id,
                'user_id' => $request->user()->id,
                'account_id' => $validated['account_id'],
                'amount_paid' => $validated['amount_paid'],
                'paid_date' => $validated['paid_date'],
                'notes' => $validated['notes'] ?? null,
            ]);

            $bill->update(['status' => 'paid']);

            return $bill->fresh(['category', 'account', 'payments']);
        });

        return $this->success('Pembayaran tagihan berhasil dicatat', $updated, 201);
    }
}
