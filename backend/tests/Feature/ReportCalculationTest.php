<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Category;
use App\Models\User;
use Database\Seeders\CategorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportCalculationTest extends TestCase
{
    use RefreshDatabase;

    public function test_monthly_report_excludes_transfers_from_income_and_expense(): void
    {
        $this->seed(CategorySeeder::class);
        $user = User::factory()->create();

        $bank = Account::query()->create([
            'user_id' => $user->id,
            'name' => 'Bank A',
            'type' => 'bank',
            'initial_balance' => 5000000,
            'current_balance' => 5000000,
            'currency' => 'IDR',
            'space' => 'pribadi',
        ]);

        $savings = Account::query()->create([
            'user_id' => $user->id,
            'name' => 'Tabungan B',
            'type' => 'savings',
            'initial_balance' => 0,
            'current_balance' => 0,
            'currency' => 'IDR',
            'space' => 'pribadi',
        ]);

        $incomeCat = Category::query()->where('type', 'income')->firstOrFail();
        $expenseCat = Category::query()->where('type', 'expense')->firstOrFail();

        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'income',
            'category_id' => $incomeCat->id,
            'account_id' => $bank->id,
            'amount' => 10000000,
            'transaction_date' => '2026-11-01',
        ]);

        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'expense',
            'category_id' => $expenseCat->id,
            'account_id' => $bank->id,
            'amount' => 2500000,
            'transaction_date' => '2026-11-05',
        ]);

        $this->actingAs($user)->postJson('/api/v1/transactions', [
            'type' => 'transfer',
            'account_id' => $bank->id,
            'to_account_id' => $savings->id,
            'amount' => 3000000,
            'transaction_date' => '2026-11-06',
        ]);

        $res = $this->actingAs($user)->getJson('/api/v1/reports/monthly?month=11&year=2026');
        $res->assertOk()
            ->assertJsonPath('data.summary.monthly_income', 10000000)
            ->assertJsonPath('data.summary.monthly_expense', 2500000)
            ->assertJsonPath('data.summary.monthly_net', 7500000);
    }
}
