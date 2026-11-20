<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\FamilyResource;
use App\Models\Family;
use App\Models\FamilyMember;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class FamilyController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $families = $request->user()->families()->with('members.user')->get();

        return $this->success('Daftar keluarga berhasil dimuat', FamilyResource::collection($families));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'head_of_family' => ['nullable', 'string', 'max:120'],
            'city' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:500'],
            'phone' => ['nullable', 'string', 'max:30'],
        ]);

        $family = DB::transaction(function () use ($request, $validated) {
            $family = Family::query()->create([
                'owner_id' => $request->user()->id,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'head_of_family' => $validated['head_of_family'] ?? null,
                'city' => $validated['city'] ?? null,
                'address' => $validated['address'] ?? null,
                'phone' => $validated['phone'] ?? null,
            ]);

            FamilyMember::query()->create([
                'family_id' => $family->id,
                'user_id' => $request->user()->id,
                'role' => 'owner',
                'relationship' => 'Kepala Keluarga',
                'can_view_private' => false,
            ]);

            return $family->load('members.user');
        });

        return $this->success('Keluarga berhasil dibuat', new FamilyResource($family), 201);
    }

    public function show(Request $request, Family $family): JsonResponse
    {
        $isMember = $family->members()->where('user_id', $request->user()->id)->exists();
        if (! $isMember) {
            return $this->error('Anda tidak memiliki akses ke keluarga ini.', 403);
        }

        return $this->success('Detail keluarga berhasil dimuat', new FamilyResource($family->load('members.user')));
    }

    public function update(Request $request, Family $family): JsonResponse
    {
        $this->authorizeFamilyAdmin($request->user(), $family);

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'head_of_family' => ['nullable', 'string', 'max:120'],
            'city' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:500'],
            'phone' => ['nullable', 'string', 'max:30'],
        ]);

        $family->update($validated);

        return $this->success('Profil keluarga berhasil diperbarui', new FamilyResource($family->fresh('members.user')));
    }

    public function addMember(Request $request, Family $family): JsonResponse
    {
        $this->authorizeFamilyAdmin($request->user(), $family);

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2'],
            'email' => ['required', 'email'],
            'role' => ['required', Rule::in(['admin', 'member', 'viewer'])],
            'relationship' => ['nullable', 'string', 'max:60'],
            'can_view_private' => ['boolean'],
        ]);

        $targetUser = User::query()->firstOrCreate(
            ['email' => strtolower($validated['email'])],
            ['name' => $validated['name'], 'password' => Hash::make(str()->random(16)), 'currency' => 'IDR']
        );

        if ($family->members()->where('user_id', $targetUser->id)->exists()) {
            return $this->error('Pengguna sudah menjadi anggota keluarga ini.', 422);
        }

        FamilyMember::query()->create([
            'family_id' => $family->id,
            'user_id' => $targetUser->id,
            'role' => $validated['role'],
            'relationship' => $validated['relationship'] ?? null,
            'can_view_private' => (bool) ($validated['can_view_private'] ?? false),
        ]);

        return $this->success('Anggota keluarga berhasil ditambahkan', new FamilyResource($family->fresh('members.user')), 201);
    }

    public function updateMember(Request $request, Family $family, int $memberId): JsonResponse
    {
        $this->authorizeFamilyAdmin($request->user(), $family);

        $member = $family->members()->whereKey($memberId)->firstOrFail();
        $validated = $request->validate([
            'role' => ['nullable', Rule::in(['admin', 'member', 'viewer'])],
            'relationship' => ['nullable', 'string', 'max:60'],
            'can_view_private' => ['nullable', 'boolean'],
        ]);

        if ($member->role === 'owner' && isset($validated['role'])) {
            return $this->error('Role Owner tidak dapat diturunkan.', 422);
        }

        $member->update(array_filter($validated, fn ($v) => $v !== null));

        return $this->success('Izin anggota berhasil diperbarui', new FamilyResource($family->fresh('members.user')));
    }

    public function removeMember(Request $request, Family $family, int $memberId): JsonResponse
    {
        $this->authorizeFamilyAdmin($request->user(), $family);

        $member = $family->members()->whereKey($memberId)->firstOrFail();
        if ($member->role === 'owner') {
            return $this->error('Pemilik keluarga tidak dapat dihapus.', 422);
        }

        $member->delete();

        return $this->success('Anggota keluarga berhasil dihapus', new FamilyResource($family->fresh('members.user')));
    }

    private function authorizeFamilyAdmin(User $user, Family $family): void
    {
        $membership = $family->members()->where('user_id', $user->id)->first();
        if (! $membership || ! in_array($membership->role, ['owner', 'admin'], true)) {
            abort(403, 'Anda tidak memiliki izin untuk mengelola anggota keluarga ini.');
        }
    }
}
