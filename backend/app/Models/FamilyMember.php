<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FamilyMember extends Model
{
    protected $fillable = [
        'family_id',
        'user_id',
        'role',
        'relationship',
        'can_view_private',
        'joined_at',
    ];

    protected function casts(): array
    {
        return [
            'can_view_private' => 'boolean',
            'joined_at' => 'datetime',
        ];
    }

    public function family(): BelongsTo
    {
        return $this->belongsTo(Family::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
