import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { optionalNullableIdSchema, parseOptionalId, roundToPrecision } from './formHelpers';

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

test('roundToPrecision preserves up to 8 decimals for digital gold grams', () => {
  assert.equal(roundToPrecision(2.66165432, 8), 2.66165432);
  assert.equal(roundToPrecision(2.66165 + 0.00001, 8), 2.66166);
  assert.equal(roundToPrecision(0.1 + 0.2, 8), 0.3);
});
