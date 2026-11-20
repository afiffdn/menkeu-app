# Family Finance — Sistem Manajemen Keuangan Pribadi & Keluarga

Sistem manajemen keuangan pribadi dan keluarga berbasis arsitektur **API-first** (Web Dashboard React + TypeScript + Tailwind CSS, serta Backend REST API Laravel 11 + Sanctum + MySQL 8 yang siap digunakan untuk aplikasi mobile Android/iOS).

## Struktur Proyek

```text
family-finance/
├── src/                      # Frontend React + TypeScript + Vite + Tailwind CSS + Recharts + Axios + Zod
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── services/
│   ├── hooks/
│   ├── types/
│   └── utils/
├── server.ts & server/       # Preview API runtime (/api/v1/*) agar frontend berjalan langsung di lingkungan Node/AI Studio
├── backend/                  # Source code Backend Laravel 11 (PHP 8.3+) + Sanctum + MySQL 8
│   ├── app/
│   │   ├── Http/Controllers/Api/V1/
│   │   ├── Http/Requests/Api/V1/
│   │   ├── Http/Resources/
│   │   ├── Models/
│   │   ├── Policies/
│   │   └── Services/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   ├── routes/api.php
│   └── tests/Feature/
├── docs/
│   ├── api/openapi.yaml      # Dokumentasi OpenAPI 3.1 / Swagger
│   └── database/erd.md       # Desain ERD & Integritas Database MySQL 8
└── docker-compose.yml
```

## Menjalankan Backend Laravel + MySQL Secara Lokal

1. Pastikan **PHP 8.3+**, **Composer**, dan **MySQL 8+** terpasang (atau jalankan MySQL via `docker compose up -d mysql`).
2. Masuk ke direktori backend dan salin konfigurasi environment:
   ```bash
   cd backend
   composer install
   cp .env.example .env
   php artisan key:generate
   ```
3. Sesuaikan kredensial MySQL pada `backend/.env` (`DB_DATABASE=family_finance`).
4. Jalankan migrasi dan seeder (seeder demo hanya berjalan di non-production):
   ```bash
   php artisan migrate --seed
   php artisan serve --port=8000
   ```
5. Jalankan pengujian otomatis PHPUnit:
   ```bash
   php artisan test
   ```

## Menjalankan Frontend React

1. Pada root proyek:
   ```bash
   npm install
   ```
2. Untuk mengarahkan frontend langsung ke Laravel API di lokal (`http://localhost:8000/api/v1`), atur environment variable `VITE_API_BASE_URL=http://localhost:8000/api/v1` lalu jalankan:
   ```bash
   npm run build
   npx vite --port=3000
   ```
3. Atau jalankan `npm run dev` (menjalankan server Express + Vite di port 3000 dengan kontrak `/api/v1/*` identik).

## Akun Demo (Data Contoh)

- **Email**: `demo@familyfinance.id`
- **Kata Sandi**: `Demo1234!`
- **Anggota Keluarga Contoh Lain**: `sari@familyfinance.id` / `Demo1234!` (memiliki akun pribadi yang terisolasi oleh policy privasi)
