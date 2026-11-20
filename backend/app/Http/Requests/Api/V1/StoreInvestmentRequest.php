<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreInvestmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'platform' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(['digital_gold', 'mutual_fund', 'stock', 'deposit', 'other'])],
            'purchase_date' => ['required', 'date'],
            'units' => ['required', 'numeric', 'gt:0'],
            'unit_label' => ['required', 'string', 'max:20'],
            'buy_price_per_unit' => ['required', 'numeric', 'gt:0'],
            'current_market_price' => ['required', 'numeric', 'gt:0'],
            'space' => ['required', Rule::in(['pribadi', 'keluarga', 'anak'])],
            'source_account_id' => ['nullable', 'integer', 'exists:accounts,id'],
        ];
    }
}
