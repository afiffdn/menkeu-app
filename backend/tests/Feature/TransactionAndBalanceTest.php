<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Category;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TransactionAndBalanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_income_expense_transfer_update_and_delete_maintain_exact_balances(): void
    {
        $this->seed(CategorySeeder::class);
        $user = User::factory()->create();

        $bank = Account::query()->create([
            'user_id' => $user->id,
            'name' => 'Bank Utama',
            'type' => 'bank',
            'initial_balance' => 1000000,
            'current_balance' => 1000000,
            'currency' => 'IDR',
            'space' => 'pribadi',
        ]);

        $cash = Account::query()->create([
            'user_id' => $user->id,
            'name' => 'Tunai',
            'type' => 'cash',
            'initial_balance' => 200000,
            'current_balance' => 200000,
            'currency' => 'IDR',
            'space' => 'pribadi',
        ]);

        $incomeCat = Category::query()->where('type', 'income')->firstOrFail();
        $expenseCat = Category::query()->where('type', 'expense')->firstOrFail();

        // 1. Income +500.000
        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'income',
            'category_id' => $incomeCat->id,
            'account_id' => $bank->id,
            'amount' => 500000,
            'transaction_date' => '2026-11-10',
            'idempotency_key' => 'key-inc-1',
        ])->assertStatus(201);

        $this->assertEquals(1500000, (float) $bank->fresh()->current_balance);

        // 2. Idempotency replay does not double-credit
        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'income',
            'category_id' => $incomeCat->id,
            'account_id' => $bank->id,
            'amount' => 500000,
            'transaction_date' => '2026-11-10',
            'idempotency_key' => 'key-inc-1',
        ])->assertOk();

        $this->assertEquals(1500000, (float) $bank->fresh()->current_balance);

        // 3. Transfer 300.000 from Bank to Cash
        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'transfer',
            'account_id' => $bank->id,
            'to_account_id' => $cash->id,
            'amount' => 300000,
            'transaction_date' => '2026-11-11',
        ])->assertStatus(201);

        $this->assertEquals(1200000, (float) $bank->fresh()->current_balance);
        $this->assertEquals(500000, (float) $cash->fresh()->current_balance);

        // 4. Expense exceeding balance fails validation
        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'expense',
            'category_id' => $expenseCat->id,
            'account_id' => $cash->id,
            'amount' => 900000,
            'transaction_date' => '2026-11-12',
        ])->assertStatus(422);

        // 5. Valid Expense, Update, Export, Delete
        $expRes = $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'expense',
            'category_id' => $expenseCat->id,
            'account_id' => $cash->id,
            'amount' => 100000,
            'transaction_date' => '2026-11-12',
        ])->assertStatus(201);

        $txId = $expRes->json('data.id');
        $this->assertEquals(400000, (float) $cash->fresh()->current_balance);

        $this->actingAs($user)->get('/api/v1/transactions/export?format=csv')->assertOk();

        $this->actingAs($user)->putJson("/api/v1/transactions/{$txId}", ['amount' => 150000])->assertOk();
        $this->assertEquals(350000, (float) $cash->fresh()->current_balance);

        $this->actingAs($user)->deleteJson("/api/v1/transactions/{$txId}")->assertOk();
        $this->assertEquals(500000, (float) $cash->fresh()->current_balance);
    }
}
