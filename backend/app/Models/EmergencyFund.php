<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmergencyFund extends Model
{
    protected $fillable = [
        'user_id',
        'family_id',
        'name',
        'target_amount',
        'current_amount',
        'space',
        'account_ids',
    ];

    protected function casts(): array
    {
        return [
            'target_amount' => 'decimal:2',
            'current_amount' => 'decimal:2',
            'account_ids' => 'array',
        ];
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(EmergencyFundTransaction::class)->latest('transaction_date');
    }
}
