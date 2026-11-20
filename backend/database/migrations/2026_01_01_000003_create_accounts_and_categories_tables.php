<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->string('name');
            $table->enum('type', ['cash', 'bank', 'ewallet', 'savings', 'emergency', 'investment', 'gold']);
            $table->decimal('initial_balance', 20, 2)->default(0);
            $table->decimal('current_balance', 20, 2)->default(0);
            $table->string('currency', 3)->default('IDR');
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('pribadi');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->softDeletes();
            $table->timestamps();

            $table->index(['family_id', 'space', 'is_active']);
            $table->index(['user_id', 'space']);
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('family_id')->nullable()->constrained('families')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->enum('type', ['income', 'expense']);
            $table->string('icon')->nullable();
            $table->string('color', 20)->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestamps();

            $table->index(['type', 'is_system']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
        Schema::dropIfExists('accounts');
    }
};
