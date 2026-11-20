<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attachment extends Model
{
    protected $fillable = [
        'user_id',
        'file_name',
        'disk_path',
        'mime_type',
        'size_bytes',
    ];
}
