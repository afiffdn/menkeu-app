<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(CategorySeeder::class);

        // Jangan mengisi data demo ke database produksi secara otomatis.
        if (! app()->environment('production')) {
            $this->call(DemoFinanceSeeder::class);
        }
    }
}
