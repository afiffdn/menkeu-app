<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\EmergencyFund;
use App\Policies\FinancialRecordPolicy;
use App\Services\ReportService;
use App\Services\SavingsAndEmergencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmergencyFundController extends ApiController
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly SavingsAndEmergencyService $service,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $funds = $this->reports->scopeVisible(EmergencyFund::query()->with('transactions'), $request->user())->get();

        return $this->success('Data dana darurat berhasil dimuat', $funds);
    }

    public function store(Request $request): JsonResponse
    {
        $familyId = $request->user()->families()->value('families.id');
        if (! $this->policy->canCreateInFamily($request->user(), $familyId)) {
            return $this->error('Role Viewer tidak diizinkan membuat dana darurat.', 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'target_amount' => ['required', 'numeric', 'gt:0'],
            'space' => ['required', 'in:pribadi,keluarga,anak'],
            'account_ids' => ['nullable', 'array'],
            'account_ids.*' => ['integer', 'exists:accounts,id'],
        ]);

        $fund = EmergencyFund::query()->create([
            ...$validated,
            'user_id' => $request->user()->id,
            'family_id' => $familyId,
            'current_amount' => 0,
        ]);

        return $this->success('Dana darurat berhasil dibuat', $fund, 201);
    }

    public function update(Request $request, EmergencyFund $emergencyFund): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $emergencyFund)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'target_amount' => ['sometimes', 'numeric', 'gt:0'],
            'account_ids' => ['nullable', 'array'],
            'account_ids.*' => ['integer', 'exists:accounts,id'],
        ]);

        $emergencyFund->update($validated);

        return $this->success('Target dana darurat berhasil diperbarui', $emergencyFund->fresh('transactions'));
    }

    public function transact(Request $request, EmergencyFund $emergencyFund): JsonResponse
    {
        if (! $this->policy->view($request->user(), $emergencyFund) || ! $this->policy->canCreateInFamily($request->user(), $emergencyFund->family_id)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'type' => ['required', 'in:deposit,withdrawal'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'transaction_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->service->recordEmergencyTransaction($request->user(), $emergencyFund, $validated);

        return $this->success('Mutasi dana darurat berhasil dicatat', $updated, 201);
    }
}
