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
 * Rounds a numeric quantity to a fixed decimal precision (default 8 for gold grams).
 */
export function roundToPrecision(value: number, decimals = 8): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
