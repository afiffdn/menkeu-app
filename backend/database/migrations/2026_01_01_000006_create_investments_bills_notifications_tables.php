<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('investments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->string('name');
            $table->string('platform');
            $table->enum('type', ['digital_gold', 'mutual_fund', 'stock', 'deposit', 'other']);
            $table->date('purchase_date');
            $table->decimal('units', 16, 4);
            $table->string('unit_label', 20)->default('unit');
            $table->decimal('buy_price_per_unit', 20, 4);
            $table->decimal('total_cost', 20, 2);
            $table->decimal('current_market_price', 20, 4);
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('keluarga');
            $table->enum('price_source', ['manual', 'provider'])->default('manual');
            $table->timestamps();
        });

        Schema::create('investment_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('investment_id')->constrained('investments')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('type', ['buy', 'sell', 'dividend']);
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->decimal('units', 16, 4)->default(0);
            $table->decimal('price_per_unit', 20, 4);
            $table->decimal('total_amount', 20, 2);
            $table->date('transaction_date');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('name');
            $table->decimal('amount', 20, 2);
            $table->date('due_date');
            $table->enum('frequency', ['once', 'weekly', 'monthly', 'yearly'])->default('monthly');
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('keluarga');
            $table->enum('status', ['unpaid', 'paid', 'overdue'])->default('unpaid');
            $table->unsignedTinyInteger('reminder_days_before')->default(5);
            $table->timestamps();

            $table->index(['family_id', 'due_date', 'status']);
        });

        Schema::create('bill_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('bills')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->decimal('amount_paid', 20, 2);
            $table->date('paid_date');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            $table->enum('type', ['info', 'warning', 'danger', 'success'])->default('info');
            $table->boolean('is_read')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'is_read']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('bill_payments');
        Schema::dropIfExists('bills');
        Schema::dropIfExists('investment_transactions');
        Schema::dropIfExists('investments');
    }
};
