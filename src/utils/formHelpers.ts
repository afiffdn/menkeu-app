import { z } from 'zod';

/**
 * Normalizes an optional foreign-key ID from HTML <select> or API payloads.
 * Empty strings, 0, "0", null, and undefined all normalize to null so an
 * unselected <option value=""> is never coerced into ID 0.
 */
export function parseOptionalId(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === 0 || val === '0') {
    return null;
  }
  const num = typeof val === 'number' ? val : Number(String(val).trim());
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

/**
 * Zod schema for optional/nullable <select> foreign key fields.
 * Converts "", 0, "0", null, undefined -> null before numeric validation.
 */
export const optionalNullableIdSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === '' || val === 0 || val === '0') {
      return null;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '' || trimmed === '0') return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : val;
    }
    return val;
  },
  z.number().int('ID harus berupa bilangan bulat').positive('Pilihan tidak valid').nullable()
);

/**
 * Parses numeric input cleanly across plain numbers, Indonesian thousand grouping
 * ("10.000.000" or "1.000.000,5"), US grouping ("10,000,000.5"), and decimal commas
 * ("2,661654") while preserving single-dot decimal notation ("2.661654").
 */
export function parseFlexibleNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : NaN;
  }
  if (typeof val !== 'string') {
    return NaN;
  }

  let s = val.trim().replace(/\s+/g, '');
  if (!s) return NaN;

  // Reject clearly non-numeric characters early (allow leading +/-, digits, dots, commas, and scientific e/E)
  if (!/^[+-]?[\d.,]+(?:[eE][+-]?\d+)?$/.test(s)) {
    return NaN;
  }

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Whichever separator appears last is the decimal separator
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (s.match(/,/g) ?? []).length;
    if (commaCount > 1) {
      // Multiple commas -> US thousand separators (e.g. "1,000,000")
      s = s.replace(/,/g, '');
    } else {
      // Single comma -> decimal comma (e.g. "2,661654")
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      // Multiple dots -> Indonesian thousand separators (e.g. "10.000.000")
      s = s.replace(/\./g, '');
    }
    // Single dot is kept as decimal separator (e.g. "2.661654" or "0.005")
  }

  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function flexiblePositiveNumberSchema(message: string) {
  return z.preprocess(
    (val) => parseFlexibleNumber(val),
    z.number({ message }).finite(message).positive(message)
  );
}

export function flexibleNonNegativeNumberSchema(message: string) {
  return z.preprocess(
    (val) => parseFlexibleNumber(val),
    z.number({ message }).finite(message).min(0, message)
  );
}

/**
 * Rounds a numeric quantity to a fixed decimal precision (default 8 for gold grams).
 */
export function roundToPrecision(value: number, decimals = 8): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export interface InvestmentPreviewResult {
  valid: boolean;
  units: number;
  buyPrice: number;
  marketPrice: number;
  totalCost: number;
  currentValue: number;
  profitLoss: number;
  profitLossPct: number;
}

export function computeInvestmentPreview(
  unitsRaw: unknown,
  buyPriceRaw: unknown,
  marketPriceRaw: unknown
): InvestmentPreviewResult {
  const units = parseFlexibleNumber(unitsRaw);
  const buyPrice = parseFlexibleNumber(buyPriceRaw);
  const marketPrice = parseFlexibleNumber(marketPriceRaw);

  if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0) {
    return {
      valid: false,
      units: Number.isFinite(units) ? units : 0,
      buyPrice: Number.isFinite(buyPrice) ? buyPrice : 0,
      marketPrice: Number.isFinite(marketPrice) ? marketPrice : 0,
      totalCost: 0,
      currentValue: 0,
      profitLoss: 0,
      profitLossPct: 0,
    };
  }

  const effectiveMarket = Number.isFinite(marketPrice) && marketPrice >= 0 ? marketPrice : buyPrice;
  const totalCost = Math.round(units * buyPrice * 100) / 100;
  const currentValue = Math.round(units * effectiveMarket * 100) / 100;
  const profitLoss = Math.round((currentValue - totalCost) * 100) / 100;
  const profitLossPct = totalCost > 0 ? Math.round((profitLoss / totalCost) * 10000) / 100 : 0;

  return {
    valid: true,
    units,
    buyPrice,
    marketPrice: effectiveMarket,
    totalCost,
    currentValue,
    profitLoss,
    profitLossPct,
  };
}

/**
 * IDX (BEI) official standard since 6 Jan 2014: 1 lot = 100 shares (lembar).
 */
export const IDX_SHARES_PER_LOT = 100;

export function convertLotsToShares(lotsRaw: unknown): number {
  const lots = parseFlexibleNumber(lotsRaw);
  if (!Number.isFinite(lots) || lots <= 0) return 0;
  return Math.round(lots * IDX_SHARES_PER_LOT);
}

export function formatSharesWithLots(shares: number): string | null {
  if (!Number.isFinite(shares) || shares <= 0) return null;
  const lots = shares / IDX_SHARES_PER_LOT;
  return Number.isInteger(lots)
    ? `${new Intl.NumberFormat('id-ID').format(lots)} lot`
    : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(lots)} lot`;
}

/**
 * Normalizes an optional ticker or SBN series code (e.g. " bbca ", "ori026" -> "BBCA", "ORI026").
 * Returns null if blank. Max length 40 characters.
 */
export function normalizeAssetCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!cleaned) return null;
  return cleaned.slice(0, 40);
}

