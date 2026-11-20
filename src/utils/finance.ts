import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AccountType, BillFrequency, FamilyRole, InvestmentType, SpaceType, TransactionType } from '../types/finance';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats an integer or decimal amount into Indonesian Rupiah format:
 * Example: 1000000 -> "Rp1.000.000", -250000 -> "-Rp250.000"
 */
export function formatIDR(amount: number | string | null | undefined): string {
  const numeric = typeof amount === 'string' ? Number(amount) : Number(amount ?? 0);
  if (!Number.isFinite(numeric)) {
    return 'Rp0';
  }
  const rounded = Math.round(numeric);
  const absFormatted = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded));

  return rounded < 0 ? `-Rp${absFormatted}` : `Rp${absFormatted}`;
}

export function formatIDRCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp${(abs / 1_000_000_000).toFixed(1).replace('.', ',')}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp${(abs / 1_000_000).toFixed(1).replace('.', ',')}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp${Math.round(abs / 1_000)}rb`;
  }
  return formatIDR(amount);
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const SHORT_MONTH_NAMES_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function getMonthNameID(month: number): string {
  return MONTH_NAMES_ID[month - 1] ?? '';
}

export function getShortMonthNameID(month: number): string {
  return SHORT_MONTH_NAMES_ID[month - 1] ?? '';
}

export function formatDateID(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateLongID(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeID(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatNumberID(value: number, maxDecimals = 4): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

export function getSpaceLabel(space: SpaceType): string {
  switch (space) {
    case 'pribadi':
      return 'Pribadi';
    case 'keluarga':
      return 'Keluarga';
    case 'anak':
      return 'Anak';
  }
}

export function getAccountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    cash: 'Uang Tunai',
    bank: 'Rekening Bank',
    ewallet: 'E-Wallet',
    savings: 'Tabungan',
    emergency: 'Dana Darurat',
    investment: 'Investasi',
    gold: 'Emas Digital',
  };
  return labels[type];
}

export function getTransactionTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    income: 'Pemasukan',
    expense: 'Pengeluaran',
    transfer: 'Transfer Antar-Akun',
  };
  return labels[type];
}

export function getInvestmentTypeLabel(type: InvestmentType): string {
  const labels: Record<InvestmentType, string> = {
    digital_gold: 'Emas Digital',
    mutual_fund: 'Reksa Dana',
    stock: 'Saham',
    deposit: 'Deposito',
    other: 'Lainnya',
  };
  return labels[type];
}

export function getBillFrequencyLabel(frequency: BillFrequency): string {
  const labels: Record<BillFrequency, string> = {
    once: 'Sekali',
    weekly: 'Mingguan',
    monthly: 'Bulanan',
    yearly: 'Tahunan',
  };
  return labels[frequency];
}

export function getRoleLabel(role: FamilyRole): string {
  const labels: Record<FamilyRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
  };
  return labels[role];
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface ProfileCompletenessResult {
  filled: number;
  total: number;
  percentage: number;
  missingLabels: string[];
}

export function computeProfileCompleteness(
  user?: {
    name?: string | null;
    phone?: string | null;
    occupation?: string | null;
    birth_date?: string | null;
    address?: string | null;
  } | null,
  family?: {
    name?: string | null;
    head_of_family?: string | null;
    city?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null
): ProfileCompletenessResult {
  const checks: Array<{ label: string; value: string | null | undefined }> = [
    { label: 'Nama Lengkap', value: user?.name },
    { label: 'Nomor Telepon Pribadi', value: user?.phone },
    { label: 'Pekerjaan / Profesi', value: user?.occupation },
    { label: 'Tanggal Lahir', value: user?.birth_date },
    { label: 'Alamat Pribadi', value: user?.address },
    { label: 'Nama Keluarga', value: family?.name },
    { label: 'Kepala Keluarga', value: family?.head_of_family },
    { label: 'Kota Domisili Keluarga', value: family?.city },
    { label: 'Telepon Keluarga', value: family?.phone },
    { label: 'Alamat Keluarga', value: family?.address },
  ];

  const missingLabels: string[] = [];
  let filled = 0;

  for (const item of checks) {
    if (item.value && item.value.trim().length > 0) {
      filled += 1;
    } else {
      missingLabels.push(item.label);
    }
  }

  const total = checks.length;
  const percentage = Math.round((filled / total) * 100);

  return { filled, total, percentage, missingLabels };
}

export function formatLocalDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayISO(referenceDate: Date = new Date()): string {
  return formatLocalDateISO(referenceDate);
}

export function getFutureDateISO(daysFromNow: number, referenceDate: Date = new Date()): string {
  const target = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + daysFromNow);
  return formatLocalDateISO(target);
}

export function buildAvailableYears(options?: {
  currentYear?: number;
  dataYears?: number[];
  selectedYear?: number;
  pastSpan?: number;
  futureSpan?: number;
}): number[] {
  const currentYear = options?.currentYear ?? new Date().getFullYear();
  const pastSpan = options?.pastSpan ?? 5;
  const futureSpan = options?.futureSpan ?? 5;
  const candidates = [currentYear - pastSpan, currentYear + futureSpan];

  for (const y of options?.dataYears ?? []) {
    if (Number.isInteger(y) && y >= 1970 && y <= 2150) {
      candidates.push(y);
    }
  }
  if (
    options?.selectedYear &&
    Number.isInteger(options.selectedYear) &&
    options.selectedYear >= 1970 &&
    options.selectedYear <= 2150
  ) {
    candidates.push(options.selectedYear);
  }

  const minYear = Math.min(...candidates);
  const maxYear = Math.max(...candidates);
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y += 1) {
    years.push(y);
  }
  return years;
}
