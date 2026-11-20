<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Resources\FamilyResource;
use App\Http\Resources\UserResource;
use App\Models\Family;
use App\Models\FamilyMember;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends ApiController
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'family_name' => ['nullable', 'string', 'max:120'],
        ]);

        $result = DB::transaction(function () use ($validated) {
            $user = User::query()->create([
                'name' => $validated['name'],
                'email' => strtolower($validated['email']),
                'password' => Hash::make($validated['password']),
                'currency' => 'IDR',
            ]);

            if (! empty($validated['family_name'])) {
                $family = Family::query()->create([
                    'owner_id' => $user->id,
                    'name' => $validated['family_name'],
                ]);

                FamilyMember::query()->create([
                    'family_id' => $family->id,
                    'user_id' => $user->id,
                    'role' => 'owner',
                    'can_view_private' => false,
                ]);
            }

            $token = $user->createToken('web-dashboard')->plainTextToken;

            return ['token' => $token, 'user' => new UserResource($user)];
        });

        return $this->success('Registrasi berhasil', $result, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:60'],
        ]);

        $user = User::query()->where('email', strtolower($validated['email']))->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Email atau kata sandi salah.'],
            ]);
        }

        $token = $user->createToken($validated['device_name'] ?? 'web-dashboard')->plainTextToken;

        return $this->success('Login berhasil', [
            'token' => $token,
            'user' => new UserResource($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return $this->success('Logout berhasil');
    }

    public function refresh(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->currentAccessToken()?->delete();
        $token = $user->createToken('refresh-token')->plainTextToken;

        return $this->success('Token berhasil diperbarui', ['token' => $token]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('families.members.user');

        return $this->success('Profil pengguna berhasil dimuat', [
            'user' => new UserResource($user),
            'families' => FamilyResource::collection($user->families),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['nullable', 'email', 'unique:users,email,'.$user->id],
            'phone' => ['nullable', 'string', 'max:30'],
            'occupation' => ['nullable', 'string', 'max:120'],
            'birth_date' => ['nullable', 'date'],
            'address' => ['nullable', 'string', 'max:500'],
            'currency' => ['nullable', 'string', 'size:3'],
        ]);

        if (! empty($validated['email'])) {
            $validated['email'] = strtolower($validated['email']);
        } else {
            unset($validated['email']);
        }

        $user->update($validated);

        return $this->success('Profil berhasil diperbarui', new UserResource($user->fresh()));
    }
}
