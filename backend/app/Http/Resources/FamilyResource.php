<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FamilyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'owner_id' => $this->owner_id,
            'description' => $this->description,
            'head_of_family' => $this->head_of_family,
            'city' => $this->city,
            'address' => $this->address,
            'phone' => $this->phone,
            'members' => $this->members->map(fn ($member) => [
                'id' => $member->id,
                'family_id' => $member->family_id,
                'user_id' => $member->user_id,
                'name' => $member->user?->name ?? '',
                'email' => $member->user?->email ?? '',
                'avatar_url' => $member->user?->avatar_url,
                'role' => $member->role,
                'relationship' => $member->relationship,
                'can_view_private' => (bool) $member->can_view_private,
                'joined_at' => $member->joined_at?->toIso8601String(),
            ])->values()->all(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
