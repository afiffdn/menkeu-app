<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('file_name');
            $table->string('disk_path');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size_bytes');
            $table->timestamps();
        });

        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->string('reference_code', 32)->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_id')->nullable()->constrained('families')->nullOnDelete();
            $table->enum('type', ['income', 'expense', 'transfer']);
            $table->foreignId('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('to_account_id')->nullable()->constrained('accounts')->restrictOnDelete();
            $table->decimal('amount', 20, 2);
            $table->enum('space', ['pribadi', 'keluarga', 'anak'])->default('keluarga');
            $table->date('transaction_date');
            $table->text('notes')->nullable();
            $table->string('idempotency_key', 100)->nullable();
            $table->foreignId('attachment_id')->nullable()->constrained('attachments')->nullOnDelete();
            $table->boolean('is_asset_allocation')->default(false);
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['family_id', 'transaction_date', 'type']);
            $table->index(['account_id', 'transaction_date']);
            $table->index(['space', 'transaction_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
        Schema::dropIfExists('attachments');
    }
};
