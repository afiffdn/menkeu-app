<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransactionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_code' => $this->reference_code,
            'user_id' => $this->user_id,
            'recorder_name' => $this->user?->name,
            'family_id' => $this->family_id,
            'type' => $this->type,
            'category_id' => $this->category_id,
            'category_name' => $this->category?->name ?? ($this->type === 'transfer' ? 'Transfer Antar-Akun' : null),
            'account_id' => $this->account_id,
            'account_name' => $this->account?->name,
            'to_account_id' => $this->to_account_id,
            'to_account_name' => $this->toAccount?->name,
            'amount' => (float) $this->amount,
            'space' => $this->space,
            'transaction_date' => $this->transaction_date?->format('Y-m-d'),
            'notes' => $this->notes,
            'is_asset_allocation' => (bool) $this->is_asset_allocation,
            'attachment' => $this->attachment ? [
                'id' => $this->attachment->id,
                'file_name' => $this->attachment->file_name,
                'mime_type' => $this->attachment->mime_type,
                'size_bytes' => $this->attachment->size_bytes,
                'url' => url("/api/v1/attachments/{$this->attachment->id}"),
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
