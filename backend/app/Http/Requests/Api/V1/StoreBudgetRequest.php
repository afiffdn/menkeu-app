<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'period' => ['required', Rule::in(['monthly', 'yearly'])],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'space' => ['required', Rule::in(['pribadi', 'keluarga', 'anak'])],
            'amount_limit' => ['required', 'numeric', 'gt:0'],
        ];
    }
}
