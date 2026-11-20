<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSavingsGoalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $accountId = $this->input('account_id');
        if ($accountId === '' || $accountId === 0 || $accountId === '0') {
            $this->merge(['account_id' => null]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'target_amount' => ['required', 'numeric', 'gt:0'],
            'start_date' => ['required', 'date'],
            'target_date' => ['required', 'date', 'after_or_equal:start_date'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'space' => ['required', Rule::in(['pribadi', 'keluarga', 'anak'])],
        ];
    }
}
