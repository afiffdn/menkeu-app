<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Investment;
use App\Models\InvestmentTransaction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InvestmentService
{
    public function __construct(private readonly TransactionService $transactionService) {}

    public static function toDecimalString(mixed $value, int $scale = 8): string
    {
        if (is_int($value)) {
            return (string) $value;
        }
        if (is_float($value)) {
            $formatted = sprintf("%.{$scale}F", $value);
            return str_contains($formatted, '.') ? rtrim(rtrim($formatted, '0'), '.') : $formatted;
        }
        $str = trim((string) $value);
        if ($str === '') {
            return '0';
        }
        if (stripos($str, 'e') !== false) {
            $formatted = sprintf("%.{$scale}F", (float) $str);
            return str_contains($formatted, '.') ? rtrim(rtrim($formatted, '0'), '.') : $formatted;
        }
        return $str;
    }

    public function recordTransaction(User $user, Investment $investment, array $data): Investment
    {
        return DB::transaction(function () use ($user, $investment, $data) {
            $type = $data['type'];
            $units = self::toDecimalString($data['units'], 8);
            $price = self::toDecimalString($data['price_per_unit'], 4);
            $total = $type === 'dividend' ? $price : bcmul($units, $price, 2);

            if ($type === 'buy') {
                if (! empty($data['account_id'])) {
                    $expenseCatId = Category::query()
                        ->where('type', 'expense')
                        ->where('name', 'Lainnya')
                        ->value('id')
                        ?? Category::query()->where('type', 'expense')->value('id');

                    $this->transactionService->create($user, [
                        'type' => 'expense',
                        'category_id' => $expenseCatId,
                        'account_id' => $data['account_id'],
                        'amount' => $total,
                        'space' => $investment->space,
                        'transaction_date' => $data['transaction_date'],
                        'notes' => 'Pembelian unit investasi: '.$investment->name,
                        'is_asset_allocation' => true,
                    ]);
                }

                $investment->total_cost = bcadd((string) $investment->total_cost, $total, 2);
                $investment->units = bcadd((string) $investment->units, $units, 8);
                if (bccomp((string) $investment->units, '0', 8) > 0) {
                    $investment->buy_price_per_unit = bcdiv((string) $investment->total_cost, (string) $investment->units, 4);
                }
                $investment->current_market_price = $price;
            } elseif ($type === 'sell') {
                if (bccomp($units, (string) $investment->units, 8) > 0) {
                    throw ValidationException::withMessages(['units' => ['Jumlah unit jual melebihi kepemilikan.']]);
                }
                $avgCost = bcdiv((string) $investment->total_cost, (string) $investment->units, 8);
                $costReduction = bcmul($avgCost, $units, 2);
                $investment->units = bcsub((string) $investment->units, $units, 8);
                $remainingCost = bcsub((string) $investment->total_cost, $costReduction, 2);
                $investment->total_cost = bccomp($remainingCost, '0.00', 2) < 0 ? '0.00' : $remainingCost;

                if (! empty($data['account_id'])) {
                    $incomeCatId = Category::query()
                        ->where('type', 'income')
                        ->where('name', 'Investasi')
                        ->value('id')
                        ?? Category::query()->where('type', 'income')->value('id');

                    $this->transactionService->create($user, [
                        'type' => 'income',
                        'category_id' => $incomeCatId,
                        'account_id' => $data['account_id'],
                        'amount' => $total,
                        'space' => $investment->space,
                        'transaction_date' => $data['transaction_date'],
                        'notes' => 'Penjualan unit investasi: '.$investment->name,
                        'is_asset_allocation' => true,
                    ]);
                }
            }

            $investment->save();

            InvestmentTransaction::query()->create([
                'investment_id' => $investment->id,
                'user_id' => $user->id,
                'type' => $type,
                'account_id' => $data['account_id'] ?? null,
                'units' => $units,
                'price_per_unit' => $price,
                'total_amount' => $total,
                'transaction_date' => $data['transaction_date'],
                'notes' => $data['notes'] ?? null,
            ]);

            return $investment->fresh('transactions');
        });
    }
}
