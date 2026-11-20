<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Bill;
use App\Models\Budget;
use App\Models\Category;
use App\Models\EmergencyFund;
use App\Models\Family;
use App\Models\FamilyMember;
use App\Models\Investment;
use App\Models\Notification;
use App\Models\SavingsGoal;
use App\Models\User;
use App\Services\TransactionService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoFinanceSeeder extends Seeder
{
    public function run(): void
    {
        if (User::query()->where('email', 'demo@familyfinance.id')->exists()) {
            return;
        }

        $owner = User::query()->create([
            'name' => 'Andi Pratama (Demo)',
            'email' => 'demo@familyfinance.id',
            'password' => Hash::make('Demo1234!'),
            'currency' => 'IDR',
        ]);

        $partner = User::query()->create([
            'name' => 'Sari Lestari (Demo)',
            'email' => 'sari@familyfinance.id',
            'password' => Hash::make('Demo1234!'),
            'currency' => 'IDR',
        ]);

        $family = Family::query()->create([
            'owner_id' => $owner->id,
            'name' => 'Keluarga Pratama (Data Contoh)',
            'description' => 'Data demo keluarga untuk pengujian dan pengembangan lokal.',
        ]);

        FamilyMember::query()->create([
            'family_id' => $family->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'can_view_private' => false,
        ]);

        FamilyMember::query()->create([
            'family_id' => $family->id,
            'user_id' => $partner->id,
            'role' => 'admin',
            'can_view_private' => false,
        ]);

        $bcaFamily = Account::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'name' => 'BCA Utama Keluarga (Contoh)',
            'type' => 'bank',
            'initial_balance' => 85000000,
            'current_balance' => 85000000,
            'currency' => 'IDR',
            'space' => 'keluarga',
        ]);

        $cashFamily = Account::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'name' => 'Dompet Tunai Rumah (Contoh)',
            'type' => 'cash',
            'initial_balance' => 1500000,
            'current_balance' => 1500000,
            'currency' => 'IDR',
            'space' => 'keluarga',
        ]);

        $emergencyAcc = Account::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'name' => 'Jenius Dana Darurat (Contoh)',
            'type' => 'emergency',
            'initial_balance' => 35000000,
            'current_balance' => 35000000,
            'currency' => 'IDR',
            'space' => 'keluarga',
        ]);

        $sariPrivateAcc = Account::query()->create([
            'user_id' => $partner->id,
            'family_id' => $family->id,
            'name' => 'BCA Pribadi Sari (Contoh)',
            'type' => 'bank',
            'initial_balance' => 8000000,
            'current_balance' => 8000000,
            'currency' => 'IDR',
            'space' => 'pribadi',
        ]);

        $salaryCat = Category::query()->where('name', 'Gaji')->where('type', 'income')->firstOrFail();
        $freelanceCat = Category::query()->where('name', 'Freelance')->where('type', 'income')->firstOrFail();
        $foodCat = Category::query()->where('name', 'Makanan')->where('type', 'expense')->firstOrFail();
        $billCat = Category::query()->where('name', 'Tagihan')->where('type', 'expense')->firstOrFail();

        $txService = app(TransactionService::class);
        $txService->create($owner, [
            'type' => 'income',
            'category_id' => $salaryCat->id,
            'account_id' => $bcaFamily->id,
            'amount' => 18500000,
            'space' => 'keluarga',
            'transaction_date' => now()->startOfMonth()->format('Y-m-d'),
            'notes' => 'Gaji Bulanan Andi (Data Contoh)',
        ]);

        $txService->create($partner, [
            'type' => 'income',
            'category_id' => $freelanceCat->id,
            'account_id' => $bcaFamily->id,
            'amount' => 4250000,
            'space' => 'keluarga',
            'transaction_date' => now()->startOfMonth()->addDays(3)->format('Y-m-d'),
            'notes' => 'Kontribusi Proyek Desain Sari (Data Contoh)',
        ]);

        $txService->create($owner, [
            'type' => 'expense',
            'category_id' => $foodCat->id,
            'account_id' => $bcaFamily->id,
            'amount' => 1850000,
            'space' => 'keluarga',
            'transaction_date' => now()->format('Y-m-d'),
            'notes' => 'Belanja pangan keluarga (Data Contoh)',
        ]);

        $txService->create($owner, [
            'type' => 'transfer',
            'account_id' => $bcaFamily->id,
            'to_account_id' => $emergencyAcc->id,
            'amount' => 1500000,
            'space' => 'keluarga',
            'transaction_date' => now()->format('Y-m-d'),
            'notes' => 'Setoran Dana Darurat Keluarga (Data Contoh)',
            'is_asset_allocation' => true,
        ]);

        $txService->create($partner, [
            'type' => 'expense',
            'category_id' => $foodCat->id,
            'account_id' => $sariPrivateAcc->id,
            'amount' => 450000,
            'space' => 'pribadi',
            'transaction_date' => now()->format('Y-m-d'),
            'notes' => 'Transaksi Pribadi Sari (Terlindungi Privasi)',
        ]);

        Budget::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'category_id' => $foodCat->id,
            'period' => 'monthly',
            'month' => (int) now()->month,
            'year' => (int) now()->year,
            'space' => 'keluarga',
            'amount_limit' => 3000000,
        ]);

        SavingsGoal::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'account_id' => $bcaFamily->id,
            'name' => 'Tabungan Rumah Keluarga (Contoh)',
            'target_amount' => 150000000,
            'current_amount' => 44500000,
            'start_date' => now()->startOfYear()->format('Y-m-d'),
            'target_date' => now()->addYears(2)->format('Y-m-d'),
            'space' => 'keluarga',
            'status' => 'active',
        ]);

        EmergencyFund::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'name' => 'Dana Darurat Keluarga (Contoh)',
            'target_amount' => 60000000,
            'current_amount' => 36500000,
            'space' => 'keluarga',
            'account_ids' => [$emergencyAcc->id],
        ]);

        Investment::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'name' => 'Emas Digital Pegadaian (Contoh)',
            'platform' => 'Pegadaian Digital',
            'type' => 'digital_gold',
            'purchase_date' => now()->subMonths(4)->format('Y-m-d'),
            'units' => 18.5,
            'unit_label' => 'gram',
            'buy_price_per_unit' => 1295000,
            'total_cost' => 23957500,
            'current_market_price' => 1465000,
            'space' => 'keluarga',
            'price_source' => 'manual',
        ]);

        Bill::query()->create([
            'user_id' => $owner->id,
            'family_id' => $family->id,
            'category_id' => $billCat->id,
            'account_id' => $cashFamily->id,
            'name' => 'Tagihan Listrik PLN (Contoh)',
            'amount' => 680000,
            'due_date' => now()->addDays(3)->format('Y-m-d'),
            'frequency' => 'monthly',
            'space' => 'keluarga',
            'status' => 'unpaid',
        ]);

        Notification::query()->create([
            'user_id' => $owner->id,
            'title' => 'Pengingat Tagihan Listrik PLN',
            'message' => 'Tagihan Listrik PLN sebesar Rp680.000 akan jatuh tempo dalam 3 hari.',
            'type' => 'warning',
            'is_read' => false,
        ]);
    }
}
