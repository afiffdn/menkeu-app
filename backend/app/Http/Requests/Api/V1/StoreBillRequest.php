<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBillRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $updates = [];
        foreach (['category_id', 'account_id'] as $field) {
            $val = $this->input($field);
            if ($val === '' || $val === 0 || $val === '0') {
                $updates[$field] = null;
            }
        }
        if ($updates !== []) {
            $this->merge($updates);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'due_date' => ['required', 'date'],
            'frequency' => ['required', Rule::in(['once', 'weekly', 'monthly', 'yearly'])],
            'space' => ['required', Rule::in(['pribadi', 'keluarga', 'anak'])],
            'reminder_days_before' => ['nullable', 'integer', 'min:1', 'max:30'],
        ];
    }
}
