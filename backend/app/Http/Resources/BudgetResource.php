<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BudgetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'category_id' => $this->category_id,
            'category_name' => $this->category?->name,
            'period' => $this->period,
            'month' => $this->month,
            'year' => $this->year,
            'space' => $this->space,
            'amount_limit' => (float) $this->amount_limit,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
