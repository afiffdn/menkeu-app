<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'type' => ['required', Rule::in(['cash', 'bank', 'ewallet', 'savings', 'emergency', 'investment', 'gold'])],
            'initial_balance' => ['required', 'numeric', 'min:0'],
            'space' => ['required', Rule::in(['pribadi', 'keluarga', 'anak'])],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['boolean'],
        ];
    }
}
