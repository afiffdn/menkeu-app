<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $familyIds = $request->user()->families()->pluck('families.id')->all();

        $categories = Category::query()
            ->where('is_system', true)
            ->orWhere('user_id', $request->user()->id)
            ->orWhereIn('family_id', $familyIds)
            ->get();

        return $this->success('Daftar kategori berhasil dimuat', $categories);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'type' => ['required', 'in:income,expense'],
            'color' => ['nullable', 'string', 'max:20'],
            'icon' => ['nullable', 'string', 'max:40'],
        ]);

        $category = Category::query()->create([
            ...$validated,
            'user_id' => $request->user()->id,
            'family_id' => $request->user()->families()->value('families.id'),
            'is_system' => false,
        ]);

        return $this->success('Kategori berhasil ditambahkan', $category, 201);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        if ($category->is_system) {
            return $this->error('Kategori sistem tidak dapat diubah.', 422);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:80'],
            'color' => ['nullable', 'string', 'max:20'],
        ]);

        $category->update($validated);

        return $this->success('Kategori berhasil diperbarui', $category);
    }

    public function destroy(Category $category): JsonResponse
    {
        if ($category->is_system) {
            return $this->error('Kategori sistem tidak dapat dihapus.', 422);
        }

        $category->delete();

        return $this->success('Kategori berhasil dihapus');
    }
}
