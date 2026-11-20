<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('investments', function (Blueprint $table) {
            $table->decimal('units', 20, 8)->change();
        });

        Schema::table('investment_transactions', function (Blueprint $table) {
            $table->decimal('units', 20, 8)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('investments', function (Blueprint $table) {
            $table->decimal('units', 16, 4)->change();
        });

        Schema::table('investment_transactions', function (Blueprint $table) {
            $table->decimal('units', 16, 4)->default(0)->change();
        });
    }
};
