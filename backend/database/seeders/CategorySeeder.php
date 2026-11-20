<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            // Pemasukan
            ['name' => 'Gaji', 'type' => 'income', 'icon' => 'Briefcase', 'color' => '#059669'],
            ['name' => 'Freelance', 'type' => 'income', 'icon' => 'Laptop', 'color' => '#10b981'],
            ['name' => 'Usaha', 'type' => 'income', 'icon' => 'Store', 'color' => '#0d9488'],
            ['name' => 'Bonus', 'type' => 'income', 'icon' => 'Award', 'color' => '#14b8a6'],
            ['name' => 'Hadiah', 'type' => 'income', 'icon' => 'Gift', 'color' => '#22c55e'],
            ['name' => 'Investasi', 'type' => 'income', 'icon' => 'TrendingUp', 'color' => '#047857'],
            ['name' => 'Lainnya', 'type' => 'income', 'icon' => 'PlusCircle', 'color' => '#64748b'],
            // Pengeluaran
            ['name' => 'Makanan', 'type' => 'expense', 'icon' => 'Utensils', 'color' => '#ef4444'],
            ['name' => 'Transportasi', 'type' => 'expense', 'icon' => 'Car', 'color' => '#f97316'],
            ['name' => 'Tempat tinggal', 'type' => 'expense', 'icon' => 'Home', 'color' => '#eab308'],
            ['name' => 'Tagihan', 'type' => 'expense', 'icon' => 'Receipt', 'color' => '#ec4899'],
            ['name' => 'Belanja', 'type' => 'expense', 'icon' => 'ShoppingBag', 'color' => '#8b5cf6'],
            ['name' => 'Kesehatan', 'type' => 'expense', 'icon' => 'HeartPulse', 'color' => '#06b6d4'],
            ['name' => 'Pendidikan', 'type' => 'expense', 'icon' => 'GraduationCap', 'color' => '#3b82f6'],
            ['name' => 'Hiburan', 'type' => 'expense', 'icon' => 'Film', 'color' => '#6366f1'],
            ['name' => 'Kebutuhan keluarga', 'type' => 'expense', 'icon' => 'Users', 'color' => '#14b8a6'],
            ['name' => 'Cicilan', 'type' => 'expense', 'icon' => 'CreditCard', 'color' => '#dc2626'],
            ['name' => 'Lainnya', 'type' => 'expense', 'icon' => 'CircleDot', 'color' => '#64748b'],
        ];

        foreach ($categories as $cat) {
            Category::query()->firstOrCreate(
                ['name' => $cat['name'], 'type' => $cat['type'], 'is_system' => true],
                $cat + ['is_system' => true]
            );
        }
    }
}
