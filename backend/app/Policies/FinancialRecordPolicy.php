<?php

namespace App\Policies;

use App\Models\FamilyMember;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FinancialRecordPolicy
{
    public function canCreateInFamily(User $user, ?int $familyId): bool
    {
        if (empty($familyId)) {
            return true;
        }

        $membership = FamilyMember::query()
            ->where('family_id', $familyId)
            ->where('user_id', $user->id)
            ->first();

        if (! $membership) {
            return false;
        }

        return $membership->role !== 'viewer';
    }

    public function view(User $user, Model $record): bool
    {
        if ((int) $record->user_id === (int) $user->id) {
            return true;
        }

        if (empty($record->family_id)) {
            return false;
        }

        $membership = FamilyMember::query()
            ->where('family_id', $record->family_id)
            ->where('user_id', $user->id)
            ->first();

        if (! $membership) {
            return false;
        }

        if ($record->space === 'pribadi') {
            return $membership->can_view_private && in_array($membership->role, ['owner', 'admin'], true);
        }

        return true;
    }

    public function modify(User $user, Model $record): bool
    {
        $membership = ! empty($record->family_id)
            ? FamilyMember::query()
                ->where('family_id', $record->family_id)
                ->where('user_id', $user->id)
                ->first()
            : null;

        if ($membership && $membership->role === 'viewer') {
            return false;
        }

        if ((int) $record->user_id === (int) $user->id) {
            return true;
        }

        if (! $membership || $record->space === 'pribadi') {
            return false;
        }

        return in_array($membership->role, ['owner', 'admin'], true);
    }
}
