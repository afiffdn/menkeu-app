<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('investments', 'asset_code')) {
            Schema::table('investments', function (Blueprint $table) {
                $table->string('asset_code', 40)->nullable()->after('platform');
            });
        }

        $driver = DB::getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement(
                "ALTER TABLE `investments` MODIFY `type` ENUM('digital_gold','mutual_fund','stock','bond','deposit','other') NOT NULL"
            );
        } else {
            Schema::table('investments', function (Blueprint $table) {
                $table->string('type', 32)->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('investments', 'asset_code')) {
            Schema::table('investments', function (Blueprint $table) {
                $table->dropColumn('asset_code');
            });
        }

        $driver = DB::getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement(
                "UPDATE `investments` SET `type` = 'other' WHERE `type` = 'bond'"
            );
            DB::statement(
                "ALTER TABLE `investments` MODIFY `type` ENUM('digital_gold','mutual_fund','stock','deposit','other') NOT NULL"
            );
        }
    }
};
