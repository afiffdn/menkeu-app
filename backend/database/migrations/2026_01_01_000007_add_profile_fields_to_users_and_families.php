<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 30)->nullable()->after('email');
            $table->string('occupation', 120)->nullable()->after('phone');
            $table->date('birth_date')->nullable()->after('occupation');
            $table->text('address')->nullable()->after('birth_date');
        });

        Schema::table('families', function (Blueprint $table) {
            $table->string('head_of_family', 120)->nullable()->after('description');
            $table->string('city', 120)->nullable()->after('head_of_family');
            $table->text('address')->nullable()->after('city');
            $table->string('phone', 30)->nullable()->after('address');
        });

        Schema::table('family_members', function (Blueprint $table) {
            $table->string('relationship', 60)->nullable()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('family_members', function (Blueprint $table) {
            $table->dropColumn('relationship');
        });

        Schema::table('families', function (Blueprint $table) {
            $table->dropColumn(['head_of_family', 'city', 'address', 'phone']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['phone', 'occupation', 'birth_date', 'address']);
        });
    }
};
