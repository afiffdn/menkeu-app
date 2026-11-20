import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAvailableYears,
  computeProfileCompleteness,
  formatIDR,
  formatIDRCompact,
  getFutureDateISO,
  getMonthNameID,
  getSpaceLabel,
  getTodayISO,
  getTransactionTypeLabel,
} from './finance';

test('formatIDR formats Indonesian Rupiah without decimals and with dot separators', () => {
  assert.equal(formatIDR(1000000), 'Rp1.000.000');
  assert.equal(formatIDR(0), 'Rp0');
  assert.equal(formatIDR(-250000), '-Rp250.000');
  assert.equal(formatIDR('15500000'), 'Rp15.500.000');
});

test('formatIDRCompact condenses large amounts cleanly', () => {
  assert.equal(formatIDRCompact(1500000), 'Rp1,5jt');
  assert.equal(formatIDRCompact(2500000000), 'Rp2,5M');
  assert.equal(formatIDRCompact(50000), 'Rp50rb');
});

test('Indonesian month and domain labels resolve accurately', () => {
  assert.equal(getMonthNameID(11), 'November');
  assert.equal(getSpaceLabel('keluarga'), 'Keluarga');
  assert.equal(getTransactionTypeLabel('transfer'), 'Transfer Antar-Akun');
});

test('computeProfileCompleteness calculates filled counts and missing labels accurately', () => {
  const partial = computeProfileCompleteness(
    { name: 'Andi Pratama', phone: null, occupation: '', birth_date: null, address: null },
    { name: 'Keluarga Pratama', head_of_family: null, city: null, phone: null, address: null }
  );
  assert.equal(partial.filled, 2);
  assert.equal(partial.total, 10);
  assert.equal(partial.percentage, 20);
  assert.equal(partial.missingLabels.length, 8);

  const complete = computeProfileCompleteness(
    {
      name: 'Andi Pratama',
      phone: '081234567890',
      occupation: 'Product Engineer',
      birth_date: '1991-05-14',
      address: 'Jl. Melati No. 12',
    },
    {
      name: 'Keluarga Pratama',
      head_of_family: 'Andi Pratama',
      city: 'Bandung',
      phone: '0227788990',
      address: 'Jl. Melati No. 12, Bandung',
    }
  );
  assert.equal(complete.filled, 10);
  assert.equal(complete.percentage, 100);
  assert.deepEqual(complete.missingLabels, []);
});

test('buildAvailableYears and dynamic date helpers support multi-decade ranges', () => {
  const years = buildAvailableYears({
    currentYear: 2028,
    dataYears: [2020, 2036],
    pastSpan: 3,
    futureSpan: 3,
  });
  assert.equal(years[0], 2020);
  assert.equal(years[years.length - 1], 2036);
  assert.ok(years.includes(2028));
  assert.ok(years.includes(2031));

  const ref = new Date(2028, 0, 28); // 2028-01-28 local
  assert.equal(getTodayISO(ref), '2028-01-28');
  assert.equal(getFutureDateISO(7, ref), '2028-02-04');
});
