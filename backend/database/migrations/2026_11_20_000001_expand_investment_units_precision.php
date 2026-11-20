<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('investments', function (Blueprint $table) {
            $table->decimal('units', 28, 8)->change();
            $table->decimal('buy_price_per_unit', 24, 4)->change();
            $table->decimal('total_cost', 26, 2)->change();
            $table->decimal('current_market_price', 24, 4)->change();
        });

        Schema::table('investment_transactions', function (Blueprint $table) {
            $table->decimal('units', 28, 8)->default(0)->change();
            $table->decimal('price_per_unit', 24, 4)->change();
            $table->decimal('total_amount', 26, 2)->change();
        });
    }

    public function down(): void
    {
        Schema::table('investments', function (Blueprint $table) {
            $table->decimal('units', 16, 4)->change();
            $table->decimal('buy_price_per_unit', 20, 4)->change();
            $table->decimal('total_cost', 20, 2)->change();
            $table->decimal('current_market_price', 20, 4)->change();
        });

        Schema::table('investment_transactions', function (Blueprint $table) {
            $table->decimal('units', 16, 4)->default(0)->change();
            $table->decimal('price_per_unit', 20, 4)->change();
            $table->decimal('total_amount', 20, 2)->change();
        });
    }
};
