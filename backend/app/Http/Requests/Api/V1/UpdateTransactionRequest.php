<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['sometimes', Rule::in(['income', 'expense', 'transfer'])],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'account_id' => ['sometimes', 'integer', 'exists:accounts,id'],
            'to_account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'amount' => ['sometimes', 'numeric', 'gt:0'],
            'space' => ['sometimes', Rule::in(['pribadi', 'keluarga', 'anak'])],
            'transaction_date' => ['sometimes', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
