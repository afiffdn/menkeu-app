<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmergencyFundTransaction extends Model
{
    protected $fillable = [
        'emergency_fund_id',
        'user_id',
        'type',
        'account_id',
        'amount',
        'transaction_date',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'transaction_date' => 'date:Y-m-d',
        ];
    }

    public function fund(): BelongsTo
    {
        return $this->belongsTo(EmergencyFund::class, 'emergency_fund_id');
    }
}
