<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreAccountRequest;
use App\Http\Resources\AccountResource;
use App\Http\Resources\TransactionResource;
use App\Models\Account;
use App\Models\Transaction;
use App\Policies\FinancialRecordPolicy;
use App\Services\AccountBalanceService;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountController extends ApiController
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly FinancialRecordPolicy $policy,
        private readonly AccountBalanceService $balanceService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $space = $request->query('space', 'all');
        $accounts = $this->reports->scopeVisible(Account::query()->with('user'), $request->user(), $space)->get();

        return $this->success('Daftar akun keuangan berhasil dimuat', AccountResource::collection($accounts));
    }

    public function store(StoreAccountRequest $request): JsonResponse
    {
        $data = $request->validated();
        $familyId = $request->user()->families()->value('families.id');

        if (! $this->policy->canCreateInFamily($request->user(), $familyId)) {
            return $this->error('Role Viewer tidak diizinkan menambahkan akun keuangan.', 403);
        }

        $account = Account::query()->create([
            ...$data,
            'user_id' => $request->user()->id,
            'family_id' => $familyId,
            'current_balance' => $data['initial_balance'],
            'currency' => 'IDR',
            'is_active' => $data['is_active'] ?? true,
        ]);

        return $this->success('Akun keuangan berhasil ditambahkan', new AccountResource($account->load('user')), 201);
    }

    public function show(Request $request, Account $account): JsonResponse
    {
        if (! $this->policy->view($request->user(), $account)) {
            return $this->error('Akses ditolak.', 403);
        }

        return $this->success('Detail akun berhasil dimuat', new AccountResource($account->load('user')));
    }

    public function update(Request $request, Account $account): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $account)) {
            return $this->error('Akses ditolak.', 403);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'type' => ['sometimes', Rule::in(['cash', 'bank', 'ewallet', 'savings', 'emergency', 'investment', 'gold'])],
            'space' => ['sometimes', 'in:pribadi,keluarga,anak'],
            'initial_balance' => ['sometimes', 'numeric', 'min:0'],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $account->update($validated);
        $this->balanceService->recalculate($account->id);

        return $this->success('Akun berhasil diperbarui', new AccountResource($account->fresh('user')));
    }

    public function destroy(Request $request, Account $account): JsonResponse
    {
        if (! $this->policy->modify($request->user(), $account)) {
            return $this->error('Akses ditolak.', 403);
        }

        $hasTransactions = Transaction::query()
            ->where('account_id', $account->id)
            ->orWhere('to_account_id', $account->id)
            ->exists();

        if ($hasTransactions) {
            $account->update(['is_active' => false]);
        } else {
            $account->delete();
        }

        return $this->success('Akun berhasil dinonaktifkan atau dihapus');
    }

    public function transactions(Request $request, Account $account): JsonResponse
    {
        if (! $this->policy->view($request->user(), $account)) {
            return $this->error('Akses ditolak.', 403);
        }

        $txs = Transaction::query()
            ->with(['category', 'account', 'toAccount', 'user', 'attachment'])
            ->where(fn ($q) => $q->where('account_id', $account->id)->orWhere('to_account_id', $account->id))
            ->latest('transaction_date')
            ->get();

        return $this->success('Riwayat transaksi akun berhasil dimuat', TransactionResource::collection($txs));
    }
}
