<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Investment extends Model
{
    protected $fillable = [
        'user_id',
        'family_id',
        'name',
        'platform',
        'type',
        'purchase_date',
        'units',
        'unit_label',
        'buy_price_per_unit',
        'total_cost',
        'current_market_price',
        'space',
        'price_source',
    ];

    protected function casts(): array
    {
        return [
            'purchase_date' => 'date:Y-m-d',
            'units' => 'decimal:8',
            'buy_price_per_unit' => 'decimal:4',
            'total_cost' => 'decimal:2',
            'current_market_price' => 'decimal:4',
        ];
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(InvestmentTransaction::class)->latest('transaction_date');
    }

    public function getCurrentValueAttribute(): string
    {
        return bcmul((string) $this->units, (string) $this->current_market_price, 2);
    }

    public function getProfitLossAttribute(): string
    {
        return bcsub($this->current_value, (string) $this->total_cost, 2);
    }
}
