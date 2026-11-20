<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->enum('period', ['monthly', 'yearly'])->default('monthly');
            $table->unsignedTinyInteger('month')->nullable();
            $table->unsignedSmallInteger('year');
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('keluarga');
            $table->decimal('amount_limit', 20, 2);
            $table->timestamps();

            $table->index(['family_id', 'year', 'month']);
        });

        Schema::create('savings_goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('name');
            $table->decimal('target_amount', 20, 2);
            $table->decimal('current_amount', 20, 2)->default(0);
            $table->date('start_date');
            $table->date('target_date');
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('keluarga');
            $table->enum('status', ['active', 'completed', 'paused'])->default('active');
            $table->timestamps();
        });

        Schema::create('savings_contributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('savings_goal_id')->constrained('savings_goals')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('source_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->decimal('amount', 20, 2);
            $table->date('contribution_date');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('emergency_funds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->string('name');
            $table->decimal('target_amount', 20, 2);
            $table->decimal('current_amount', 20, 2)->default(0);
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('keluarga');
            $table->json('account_ids')->nullable();
            $table->timestamps();
        });

        Schema::create('emergency_fund_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('emergency_fund_id')->constrained('emergency_funds')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('type', ['deposit', 'withdrawal']);
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->decimal('amount', 20, 2);
            $table->date('transaction_date');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emergency_fund_transactions');
        Schema::dropIfExists('emergency_funds');
        Schema::dropIfExists('savings_contributions');
        Schema::dropIfExists('savings_goals');
        Schema::dropIfExists('budgets');
    }
};
