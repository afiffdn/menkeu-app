<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreSavingsGoalRequest;
use App\Models\SavingsGoal;
use App\Policies\FinancialRecordPolicy;
use App\Services\ReportService;
use App\Services\SavingsAndEmergencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SavingsGoalController extends ApiController
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly SavingsAndEmergencyService $service,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $goals = $this->reports->scopeVisible(SavingsGoal::query()->with(['account', 'contributions.user']), $request->user())->get();

        return $this->success('Target tabungan berhasil dimuat', $goals);
    }

    public function store(StoreSavingsGoalRequest $request): JsonResponse
    {
        $familyId = $request->user()->families()->value('families.id');
        if (! $this->policy->canCreateInFamily($request->user(), $familyId)) {
            return $this->error('Role Viewer tidak diizinkan membuat target tabungan.', 403);
        }

        $goal = SavingsGoal::query()->create([
            ...$request->validated(),
            'user_id' => $request->user()->id,
            'family_id' => $familyId,
            'current_amount' => 0,
            'status' => 'active',
        ]);

        return $this->success('Target tabungan berhasil dibuat', $goal, 201);
    }

    public function contribute(Request $request, SavingsGoal $savingsGoal): JsonResponse
    {
        if (! $this->policy->view($request->user(), $savingsGoal) || ! $this->policy->canCreateInFamily($request->user(), $savingsGoal->family_id)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'source_account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'contribution_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->service->addSavingsContribution($request->user(), $savingsGoal, $validated);

        return $this->success('Setoran tabungan berhasil dicatat', $updated, 201);
    }

    public function history(Request $request, SavingsGoal $savingsGoal): JsonResponse
    {
        if (! $this->policy->view($request->user(), $savingsGoal)) {
            return $this->error('Akses ditolak.', 403);
        }

        return $this->success('Riwayat setoran tabungan berhasil dimuat', $savingsGoal->contributions()->with('user')->get());
    }
}
