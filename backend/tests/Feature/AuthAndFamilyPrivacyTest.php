<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Category;
use App\Models\Family;
use App\Models\FamilyMember;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthAndFamilyPrivacyTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_and_login_with_sanctum_token(): void
    {
        $register = $this->postJson('/api/v1/auth/register', [
            'name' => 'Budi Santoso',
            'email' => 'budi@familyfinance.id',
            'password' => 'Secret123!',
            'family_name' => 'Keluarga Santoso',
        ]);

        $register->assertStatus(201)->assertJsonPath('success', true);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'budi@familyfinance.id',
            'password' => 'Secret123!',
        ]);

        $login->assertOk()->assertJsonStructure(['data' => ['token', 'user']]);
    }

    public function test_family_member_cannot_view_another_members_private_account(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();

        $family = Family::query()->create(['owner_id' => $owner->id, 'name' => 'Keluarga Uji']);
        FamilyMember::query()->create(['family_id' => $family->id, 'user_id' => $owner->id, 'role' => 'owner', 'can_view_private' => false]);
        FamilyMember::query()->create(['family_id' => $family->id, 'user_id' => $member->id, 'role' => 'member', 'can_view_private' => false]);

        $privateAccount = Account::query()->create([
            'user_id' => $member->id,
            'family_id' => $family->id,
            'name' => 'Dompet Pribadi Member',
            'type' => 'cash',
            'initial_balance' => 1000000,
            'current_balance' => 1000000,
            'currency' => 'IDR',
            'space' => 'pribadi',
        ]);

        $this->actingAs($owner)
            ->getJson("/api/v1/accounts/{$privateAccount->id}")
            ->assertStatus(403);
    }

    public function test_viewer_role_cannot_create_transactions_in_family(): void
    {
        $this->seed(CategorySeeder::class);
        $owner = User::factory()->create();
        $viewer = User::factory()->create();

        $family = Family::query()->create(['owner_id' => $owner->id, 'name' => 'Keluarga Viewer Test']);
        FamilyMember::query()->create(['family_id' => $family->id, 'user_id' => $owner->id, 'role' => 'owner', 'can_view_private' => false]);
        FamilyMember::query()->create(['family_id' => $family->id, 'user_id' => $viewer->id, 'role' => 'viewer', 'can_view_private' => false]);

        $familyAccount = Account::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'name' => 'Kas Bersama',
            'type' => 'bank',
            'initial_balance' => 2000000,
            'current_balance' => 2000000,
            'currency' => 'IDR',
            'space' => 'keluarga',
        ]);

        $expenseCat = Category::query()->where('type', 'expense')->firstOrFail();

        $this->actingAs($viewer)
            ->postJson('/api/v1/transactions', [
                'type' => 'expense',
                'category_id' => $expenseCat->id,
                'account_id' => $familyAccount->id,
                'amount' => 100000,
                'space' => 'keluarga',
                'transaction_date' => '2026-11-15',
            ])
            ->assertStatus(403);
    }
}
