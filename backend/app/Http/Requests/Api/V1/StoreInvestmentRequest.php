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

    protected function prepareForValidation(): void
    {
        $sourceAccountId = $this->input('source_account_id');
        $updates = [];
        if ($sourceAccountId === '' || $sourceAccountId === 0 || $sourceAccountId === '0') {
            $updates['source_account_id'] = null;
        }
        $assetCode = $this->input('asset_code');
        if (is_string($assetCode)) {
            $cleanedCode = strtoupper(preg_replace('/\s+/', ' ', trim($assetCode)) ?? '');
            $updates['asset_code'] = $cleanedCode !== '' ? substr($cleanedCode, 0, 40) : null;
        }
        foreach (['units', 'buy_price_per_unit', 'current_market_price'] as $field) {
            $val = $this->input($field);
            if (is_string($val)) {
                $updates[$field] = \App\Services\InvestmentService::toDecimalString(
                    self::normalizeFlexibleNumericString($val),
                    8
                );
            }
        }
        if ($updates !== []) {
            $this->merge($updates);
        }
    }

    public static function normalizeFlexibleNumericString(string $raw): string
    {
        $s = preg_replace('/\s+/', '', trim($raw)) ?? '';
        if ($s === '') {
            return $s;
        }
        $hasDot = str_contains($s, '.');
        $hasComma = str_contains($s, ',');
        if ($hasDot && $hasComma) {
            if (strrpos($s, ',') > strrpos($s, '.')) {
                return str_replace(',', '.', str_replace('.', '', $s));
            }
            return str_replace(',', '', $s);
        }
        if ($hasComma) {
            if (substr_count($s, ',') > 1) {
                return str_replace(',', '', $s);
            }
            return str_replace(',', '.', $s);
        }
        if ($hasDot && substr_count($s, '.') > 1) {
            return str_replace('.', '', $s);
        }
        return $s;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'platform' => ['required', 'string', 'max:120'],
            'asset_code' => ['nullable', 'string', 'max:40'],
            'type' => ['required', Rule::in(['digital_gold', 'mutual_fund', 'stock', 'bond', 'deposit', 'other'])],
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
