<?php

use App\Http\Controllers\Api\V1\AccountController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BillController;
use App\Http\Controllers\Api\V1\BudgetController;
use App\Http\Controllers\Api\V1\CategoryController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\EmergencyFundController;
use App\Http\Controllers\Api\V1\FamilyController;
use App\Http\Controllers\Api\V1\InvestmentController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\SavingsGoalController;
use App\Http\Controllers\Api\V1\TransactionController;
use App\Http\Middleware\ResolveWorkspaceUser;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Public Authentication Endpoints (rate limited)
    Route::middleware('throttle:30,1')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'register']);
        Route::post('/auth/login', [AuthController::class, 'login']);
    });

    // Browser-friendly token-authenticated file download & export links
    Route::get('/transactions/export', [TransactionController::class, 'export']);
    Route::get('/attachments/{attachment}', [TransactionController::class, 'downloadAttachment']);

    // Workspace / Sanctum Token Endpoints (Web & Mobile)
    Route::middleware([ResolveWorkspaceUser::class, 'auth:sanctum', 'throttle:120,1'])->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::post('/auth/refresh', [AuthController::class, 'refresh']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::put('/auth/me', [AuthController::class, 'updateProfile']);

        // Dashboard
        Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
        Route::get('/dashboard/cash-flow', [DashboardController::class, 'cashFlow']);
        Route::get('/dashboard/expense-categories', [DashboardController::class, 'expenseCategories']);
        Route::get('/dashboard/recent-transactions', [DashboardController::class, 'recentTransactions']);

        // Families & Members
        Route::get('/families', [FamilyController::class, 'index']);
        Route::post('/families', [FamilyController::class, 'store']);
        Route::get('/families/{family}', [FamilyController::class, 'show']);
        Route::put('/families/{family}', [FamilyController::class, 'update']);
        Route::post('/families/{family}/members', [FamilyController::class, 'addMember']);
        Route::patch('/families/{family}/members/{memberId}', [FamilyController::class, 'updateMember']);
        Route::delete('/families/{family}/members/{memberId}', [FamilyController::class, 'removeMember']);

        // Accounts
        Route::apiResource('/accounts', AccountController::class);
        Route::get('/accounts/{account}/transactions', [AccountController::class, 'transactions']);

        // Categories
        Route::apiResource('/categories', CategoryController::class)->except(['show']);

        // Attachments & Transactions
        Route::post('/attachments', [TransactionController::class, 'uploadAttachment']);
        Route::apiResource('/transactions', TransactionController::class);

        // Budgets
        Route::apiResource('/budgets', BudgetController::class);

        // Savings Goals
        Route::get('/savings-goals', [SavingsGoalController::class, 'index']);
        Route::post('/savings-goals', [SavingsGoalController::class, 'store']);
        Route::post('/savings-goals/{savingsGoal}/contributions', [SavingsGoalController::class, 'contribute']);
        Route::get('/savings-goals/{savingsGoal}/history', [SavingsGoalController::class, 'history']);

        // Emergency Funds
        Route::get('/emergency-funds', [EmergencyFundController::class, 'index']);
        Route::post('/emergency-funds', [EmergencyFundController::class, 'store']);
        Route::put('/emergency-funds/{emergencyFund}', [EmergencyFundController::class, 'update']);
        Route::post('/emergency-funds/{emergencyFund}/transactions', [EmergencyFundController::class, 'transact']);

        // Investments
        Route::get('/investments', [InvestmentController::class, 'index']);
        Route::post('/investments', [InvestmentController::class, 'store']);
        Route::get('/investments/{investment}', [InvestmentController::class, 'show']);
        Route::put('/investments/{investment}', [InvestmentController::class, 'update']);
        Route::post('/investments/{investment}/transactions', [InvestmentController::class, 'transact']);

        // Bills
        Route::get('/bills', [BillController::class, 'index']);
        Route::post('/bills', [BillController::class, 'store']);
        Route::put('/bills/{bill}', [BillController::class, 'update']);
        Route::post('/bills/{bill}/payments', [BillController::class, 'recordPayment']);

        // Notifications
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

        // Metadata & Reports
        Route::get('/meta/years', [ReportController::class, 'availableYears']);
        Route::get('/reports/monthly', [ReportController::class, 'monthly']);
        Route::get('/reports/yearly', [ReportController::class, 'yearly']);
        Route::get('/reports/multi-year', [ReportController::class, 'multiYear']);
        Route::get('/reports/cash-flow', [ReportController::class, 'cashFlow']);
        Route::get('/reports/expenses', [ReportController::class, 'expenses']);
        Route::get('/reports/income', [ReportController::class, 'income']);
    });
});
