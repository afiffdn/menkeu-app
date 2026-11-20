<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreBudgetRequest;
use App\Http\Resources\BudgetResource;
use App\Models\Budget;
use App\Policies\FinancialRecordPolicy;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BudgetController extends ApiController
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $month = (int) $request->integer('month', (int) now()->month);
        $year = (int) $request->integer('year', (int) now()->year);
        $space = $request->query('space', 'all');

        return $this->success('Daftar anggaran berhasil dimuat', $this->reports->computeBudgets($request->user(), $month, $year, $space));
    }

    public function store(StoreBudgetRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $familyId = $request->user()->families()->value('families.id');

        if (! $this->policy->canCreateInFamily($request->user(), $familyId)) {
            return $this->error('Role Viewer tidak diizinkan membuat anggaran.', 403);
        }

        $budget = Budget::query()->create([
            ...$validated,
            'user_id' => $request->user()->id,
            'family_id' => $familyId,
        ]);

        return $this->success('Anggaran berhasil dibuat', new BudgetResource($budget->load('category')), 201);
    }

    public function show(Request $request, Budget $budget): JsonResponse
    {
        if (! $this->policy->view($request->user(), $budget)) {
            return $this->error('Akses ditolak.', 403);
        }

        return $this->success('Detail anggaran berhasil dimuat', new BudgetResource($budget->load('category')));
    }

    public function update(Request $request, Budget $budget): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $budget)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'amount_limit' => ['sometimes', 'numeric', 'gt:0'],
            'space' => ['sometimes', 'in:pribadi,keluarga,anak'],
        ]);

        $budget->update($validated);

        return $this->success('Anggaran berhasil diperbarui', new BudgetResource($budget->fresh('category')));
    }

    public function destroy(Request $request, Budget $budget): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $budget)) {
            return $this->error('Akses ditolak.', 403);
        }

        $budget->delete();

        return $this->success('Anggaran berhasil dihapus');
    }
}
