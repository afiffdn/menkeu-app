import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  computeInvestmentPreview,
  convertLotsToShares,
  flexibleNonNegativeNumberSchema,
  flexiblePositiveNumberSchema,
  formatSharesWithLots,
  normalizeAssetCode,
  optionalNullableIdSchema,
  parseFlexibleNumber,
  parseOptionalId,
  roundToPrecision,
} from './formHelpers';

test('parseOptionalId normalizes empty strings and zero to null', () => {
  assert.equal(parseOptionalId(''), null);
  assert.equal(parseOptionalId('0'), null);
  assert.equal(parseOptionalId(0), null);
  assert.equal(parseOptionalId(null), null);
  assert.equal(parseOptionalId(undefined), null);
  assert.equal(parseOptionalId('  '), null);
  assert.equal(parseOptionalId(-3), null);
  assert.equal(parseOptionalId('abc'), null);
  assert.equal(parseOptionalId(14), 14);
  assert.equal(parseOptionalId('27'), 27);
});

test('optionalNullableIdSchema parses empty select value as null instead of 0', () => {
  const schema = z.object({
    units: z.coerce.number().positive(),
    source_account_id: optionalNullableIdSchema,
  });

  const emptyResult = schema.safeParse({
    units: '2.661654',
    source_account_id: '',
  });
  assert.equal(emptyResult.success, true);
  if (emptyResult.success) {
    assert.equal(emptyResult.data.units, 2.661654);
    assert.equal(emptyResult.data.source_account_id, null);
  }

  const zeroResult = schema.safeParse({
    units: '2.66165432',
    source_account_id: 0,
  });
  assert.equal(zeroResult.success, true);
  if (zeroResult.success) {
    assert.equal(zeroResult.data.units, 2.66165432);
    assert.equal(zeroResult.data.source_account_id, null);
  }

  const selectedResult = schema.safeParse({
    units: '2.66165432',
    source_account_id: '5',
  });
  assert.equal(selectedResult.success, true);
  if (selectedResult.success) {
    assert.equal(selectedResult.data.source_account_id, 5);
  }

  const negativeResult = schema.safeParse({
    units: '1',
    source_account_id: '-2',
  });
  assert.equal(negativeResult.success, false);
});

test('parseFlexibleNumber handles large share counts, Indonesian thousand separators, and >4 decimal gold grams', () => {
  assert.equal(parseFlexibleNumber('2.661654'), 2.661654);
  assert.equal(parseFlexibleNumber('2,661654'), 2.661654);
  assert.equal(parseFlexibleNumber('100000000'), 100000000);
  assert.equal(parseFlexibleNumber('100.000.000'), 100000000);
  assert.equal(parseFlexibleNumber('10.000.000.000'), 10000000000);
  assert.equal(parseFlexibleNumber('1.500.000,75'), 1500000.75);
  assert.equal(parseFlexibleNumber('1,500,000.75'), 1500000.75);
  assert.equal(parseFlexibleNumber('25 000 000'), 25000000);
  assert.equal(Number.isNaN(parseFlexibleNumber('')), true);
  assert.equal(Number.isNaN(parseFlexibleNumber('abc')), true);
});

test('flexible numeric schemas accept formatted large stock units and reject invalid values', () => {
  const schema = z.object({
    units: flexiblePositiveNumberSchema('Jumlah unit harus > 0'),
    dividend_units: flexibleNonNegativeNumberSchema('Minimal 0'),
  });

  const ok = schema.safeParse({
    units: '500.000.000',
    dividend_units: '0',
  });
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.units, 500000000);
    assert.equal(ok.data.dividend_units, 0);
  }

  const bad = schema.safeParse({
    units: '0',
    dividend_units: '-1',
  });
  assert.equal(bad.success, false);
});

test('computeInvestmentPreview computes large stock & SBN bond totals accurately and preserves single-dot decimals', () => {
  const stockPreview = computeInvestmentPreview('10.000.000', '5250', '5500');
  assert.equal(stockPreview.valid, true);
  assert.equal(stockPreview.units, 10000000);
  assert.equal(stockPreview.buyPrice, 5250);
  assert.equal(stockPreview.totalCost, 52500000000);
  assert.equal(stockPreview.currentValue, 55000000000);
  assert.equal(stockPreview.profitLoss, 2500000000);
  assert.equal(stockPreview.profitLossPct, 4.76);

  const sbnPreview = computeInvestmentPreview('50', '1.000.000', '1.005.000');
  assert.equal(sbnPreview.valid, true);
  assert.equal(sbnPreview.units, 50);
  assert.equal(sbnPreview.buyPrice, 1000000);
  assert.equal(sbnPreview.totalCost, 50000000);
  assert.equal(sbnPreview.currentValue, 50250000);
  assert.equal(sbnPreview.profitLoss, 250000);
  assert.equal(sbnPreview.profitLossPct, 0.5);

  const goldPreview = computeInvestmentPreview('0.005', '2.195.211', '2.250.000');
  assert.equal(goldPreview.valid, true);
  assert.equal(goldPreview.units, 0.005);
  assert.equal(goldPreview.buyPrice, 2195211);
  assert.equal(goldPreview.currentValue, 11250);
});

test('roundToPrecision preserves up to 8 decimals for digital gold grams', () => {
  assert.equal(roundToPrecision(2.66165432, 8), 2.66165432);
  assert.equal(roundToPrecision(2.66165 + 0.00001, 8), 2.66166);
  assert.equal(roundToPrecision(0.1 + 0.2, 8), 0.3);
});

test('BEI lot conversion handles 1 lot = 100 lembar including large lot counts', () => {
  assert.equal(convertLotsToShares('10'), 1000);
  assert.equal(convertLotsToShares('100'), 10000);
  assert.equal(convertLotsToShares('10000'), 1000000);
  assert.equal(convertLotsToShares('1.000.000'), 100000000);
  assert.equal(convertLotsToShares('0'), 0);
  assert.equal(formatSharesWithLots(100000000), '1.000.000 lot');
  assert.equal(formatSharesWithLots(150), '1,5 lot');
});

test('normalizeAssetCode trims, collapses spaces, uppercases, and truncates safely', () => {
  assert.equal(normalizeAssetCode(''), null);
  assert.equal(normalizeAssetCode('   '), null);
  assert.equal(normalizeAssetCode(undefined), null);
  assert.equal(normalizeAssetCode('  ori026  '), 'ORI026');
  assert.equal(normalizeAssetCode('bbca'), 'BBCA');
  assert.equal(normalizeAssetCode('sr  021 t3'), 'SR 021 T3');
});
