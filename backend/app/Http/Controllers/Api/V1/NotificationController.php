<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $list = Notification::query()
            ->where('user_id', $request->user()->id)
            ->latest()
            ->get();

        return $this->success('Notifikasi berhasil dimuat', $list);
    }

    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        if ((int) $notification->user_id !== (int) $request->user()->id) {
            return $this->error('Akses ditolak.', 403);
        }

        $notification->update(['is_read' => true]);

        return $this->success('Notifikasi ditandai sudah dibaca');
    }
}
