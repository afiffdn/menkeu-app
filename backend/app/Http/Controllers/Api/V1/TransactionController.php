<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\StoreTransactionRequest;
use App\Http\Requests\Api\V1\UpdateTransactionRequest;
use App\Http\Resources\TransactionResource;
use App\Models\Attachment;
use App\Models\Transaction;
use App\Models\User;
use App\Policies\FinancialRecordPolicy;
use App\Services\ReportService;
use App\Services\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TransactionController extends ApiController
{
    public function __construct(
        private readonly TransactionService $service,
        private readonly ReportService $reports,
        private readonly FinancialRecordPolicy $policy,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $space = $request->query('space', 'all');
        $perPage = min(100, max(1, (int) $request->integer('per_page', 15)));

        $query = $this->buildFilteredQuery($request, $request->user(), $space);
        $paginator = $query->paginate($perPage);

        return $this->success(
            'Daftar transaksi berhasil dimuat',
            TransactionResource::collection($paginator->items()),
            200,
            [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ]
        );
    }

    public function store(StoreTransactionRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['idempotency_key'] = $request->header('X-Idempotency-Key') ?: ($data['idempotency_key'] ?? null);

        $result = $this->service->create($request->user(), $data);

        return $this->success(
            $result['deduplicated'] ? 'Transaksi sudah tercatat (idempotent)' : 'Transaksi berhasil disimpan',
            new TransactionResource($result['transaction']),
            $result['deduplicated'] ? 200 : 201
        );
    }

    public function show(Request $request, Transaction $transaction): JsonResponse
    {
        if (! $this->policy->view($request->user(), $transaction)) {
            return $this->error('Akses ditolak.', 403);
        }

        return $this->success(
            'Detail transaksi berhasil dimuat',
            new TransactionResource($transaction->load(['category', 'account', 'toAccount', 'attachment', 'user']))
        );
    }

    public function update(UpdateTransactionRequest $request, Transaction $transaction): JsonResponse
    {
        $updated = $this->service->update($request->user(), $transaction, $request->validated());

        return $this->success('Transaksi berhasil diperbarui', new TransactionResource($updated));
    }

    public function destroy(Request $request, Transaction $transaction): JsonResponse
    {
        $this->service->delete($request->user(), $transaction);

        return $this->success('Transaksi berhasil dihapus dan saldo diperbarui');
    }

    public function uploadAttachment(Request $request): JsonResponse
    {
        if ($request->hasFile('file')) {
            $request->validate([
                'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            ]);

            $file = $request->file('file');
            $path = $file->store('attachments', 'local');

            $attachment = Attachment::query()->create([
                'user_id' => $request->user()->id,
                'file_name' => $file->getClientOriginalName(),
                'disk_path' => $path,
                'mime_type' => $file->getMimeType() ?? 'application/octet-stream',
                'size_bytes' => $file->getSize(),
            ]);

            return $this->success('Bukti transaksi berhasil diunggah', $attachment, 201);
        }

        $validated = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'mime_type' => ['required', 'string', 'max:100'],
            'content_base64' => ['required', 'string'],
        ]);

        $rawContent = $validated['content_base64'];
        if (str_contains($rawContent, ',')) {
            $rawContent = explode(',', $rawContent, 2)[1];
        }
        $binary = base64_decode($rawContent, true);
        if ($binary === false || strlen($binary) > 5 * 1024 * 1024) {
            return $this->error('Berkas lampiran tidak valid atau melebihi batas 5MB.', 422);
        }

        $safeName = Str::uuid()->toString().'-'.preg_replace('/[^A-Za-z0-9._-]/', '_', $validated['file_name']);
        $diskPath = 'attachments/'.$safeName;
        Storage::disk('local')->put($diskPath, $binary);

        $attachment = Attachment::query()->create([
            'user_id' => $request->user()->id,
            'file_name' => $validated['file_name'],
            'disk_path' => $diskPath,
            'mime_type' => $validated['mime_type'],
            'size_bytes' => strlen($binary),
        ]);

        return $this->success('Bukti transaksi berhasil diunggah', $attachment, 201);
    }

    public function downloadAttachment(Request $request, Attachment $attachment): StreamedResponse|JsonResponse
    {
        $user = $this->resolveRequestUser($request);
        if (! $user) {
            return $this->error('Unauthenticated.', 401);
        }

        if ((int) $attachment->user_id !== (int) $user->id) {
            $linkedTx = Transaction::query()->where('attachment_id', $attachment->id)->first();
            if (! $linkedTx || ! $this->policy->view($user, $linkedTx)) {
                return $this->error('Akses ditolak.', 403);
            }
        }

        if (! Storage::disk('local')->exists($attachment->disk_path)) {
            return $this->error('File lampiran tidak ditemukan.', 404);
        }

        return Storage::disk('local')->download($attachment->disk_path, $attachment->file_name, [
            'Content-Type' => $attachment->mime_type,
        ]);
    }

    public function export(Request $request): Response|JsonResponse
    {
        $user = $this->resolveRequestUser($request);
        if (! $user) {
            return $this->error('Unauthenticated.', 401);
        }

        $format = $request->query('format', 'csv');
        $space = $request->query('space', 'all');
        $rows = $this->buildFilteredQuery($request, $user, $space)->get();

        $csvLines = ["Kode Referensi,Tanggal,Jenis,Kategori,Akun Asal,Akun Tujuan,Ruang,Nominal (IDR),Pencatat,Catatan"];
        foreach ($rows as $tx) {
            $fields = [
                $tx->reference_code,
                $tx->transaction_date?->format('Y-m-d') ?? '',
                $tx->type,
                $tx->category?->name ?? 'Transfer Antar-Akun',
                $tx->account?->name ?? '',
                $tx->toAccount?->name ?? '',
                $tx->space,
                number_format((float) $tx->amount, 0, ',', ''),
                $tx->user?->name ?? '',
                str_replace(["\r", "\n", '"'], ' ', $tx->notes ?? ''),
            ];
            $csvLines[] = implode(',', array_map(fn ($v) => '"'.$v.'"', $fields));
        }

        $content = "\xEF\xBB\xBF".implode("\n", $csvLines);
        $ext = $format === 'excel' ? 'xls' : 'csv';
        $mime = $format === 'excel' ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8';

        return response($content, 200, [
            'Content-Type' => $mime,
            'Content-Disposition' => "attachment; filename=\"transaksi-family-finance.{$ext}\"",
        ]);
    }

    private function buildFilteredQuery(Request $request, User $user, string $space)
    {
        return $this->reports->scopeVisible(
            Transaction::query()->with(['category', 'account', 'toAccount', 'attachment', 'user']),
            $user,
            $space
        )
            ->when($request->filled('type') && $request->query('type') !== 'all', fn ($q) => $q->where('type', $request->query('type')))
            ->when($request->filled('category_id') && $request->query('category_id') !== 'all', fn ($q) => $q->where('category_id', $request->integer('category_id')))
            ->when($request->filled('account_id') && $request->query('account_id') !== 'all', function ($q) use ($request) {
                $accId = $request->integer('account_id');
                $q->where(fn ($aq) => $aq->where('account_id', $accId)->orWhere('to_account_id', $accId));
            })
            ->when($request->filled('member_id') && $request->query('member_id') !== 'all', fn ($q) => $q->where('user_id', $request->integer('member_id')))
            ->when($request->filled('start_date'), fn ($q) => $q->whereDate('transaction_date', '>=', $request->query('start_date')))
            ->when($request->filled('end_date'), fn ($q) => $q->whereDate('transaction_date', '<=', $request->query('end_date')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->query('search').'%';
                $q->where(fn ($sq) => $sq->where('notes', 'like', $term)->orWhere('reference_code', 'like', $term));
            })
            ->latest('transaction_date')
            ->latest('id');
    }

    private function resolveRequestUser(Request $request): ?User
    {
        if ($request->user()) {
            return $request->user();
        }

        $token = $request->bearerToken() ?: $request->query('token');
        if (! $token) {
            return null;
        }

        $accessToken = PersonalAccessToken::findToken((string) $token);

        return $accessToken?->tokenable instanceof User ? $accessToken->tokenable : null;
    }
}
