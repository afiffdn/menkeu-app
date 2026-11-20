<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(['income', 'expense', 'transfer'])],
            'category_id' => ['nullable', 'integer', 'exists:categories,id', 'required_unless:type,transfer'],
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'to_account_id' => ['nullable', 'integer', 'exists:accounts,id', 'required_if:type,transfer', 'different:account_id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'space' => ['nullable', Rule::in(['pribadi', 'keluarga', 'anak'])],
            'transaction_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'attachment_id' => ['nullable', 'integer', 'exists:attachments,id'],
        ];
    }
}
