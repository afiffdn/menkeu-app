<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvestmentTransaction extends Model
{
    protected $fillable = [
        'investment_id',
        'user_id',
        'type',
        'account_id',
        'units',
        'price_per_unit',
        'total_amount',
        'transaction_date',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'units' => 'decimal:8',
            'price_per_unit' => 'decimal:4',
            'total_amount' => 'decimal:2',
            'transaction_date' => 'date:Y-m-d',
        ];
    }

    public function investment(): BelongsTo
    {
        return $this->belongsTo(Investment::class);
    }
}
