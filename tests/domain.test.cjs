'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/domain.js');

const watch = { id: 'one', brand: 'Rolex', model: 'Submariner', reference: '124060', price: 8500, marketPrice: 10000, year: 2024, condition: 'Excellent', box: true, papers: true };
const watches = [watch, { ...watch, id: 'two', brand: 'Cartier', model: 'Santos', reference: 'WSSA0018', price: 5800, marketPrice: 6000, year: 2022, condition: 'Very good', papers: false }, { ...watch, id: 'three', brand: 'Omega', model: 'Speedmaster', price: 4500, marketPrice: 5000, year: 2025 }];
const photo = { name: 'dial.jpg', type: 'image/jpeg', size: 12000 };
const valuation = { basePrice: 10000, condition: 'Excellent', box: true, papers: true, year: 2026 };

test('money conversion uses fixed example rates and does not mutate input', () => {
  assert.equal(D.convertMoney(100, 'GBP'), 100);
  assert.equal(D.convertMoney(100, 'USD'), 128);
  assert.equal(D.convertMoney(100, 'EUR'), 117);
  assert.equal(D.formatMoney(1000), '£1,000');
});
test('money rejects non-finite, negative, unsupported and coercible inputs', () => {
  for (const amount of [NaN, Infinity, -1, '100', null]) assert.throws(() => D.convertMoney(amount), RangeError);
  for (const currency of ['BRL', '__proto__', 'constructor', 'gbp']) assert.throws(() => D.convertMoney(10, currency), RangeError);
});
test('photo metadata accepts supported exact MIME and extensions', () => {
  assert.equal(D.validatePhoto(photo), null);
  assert.equal(D.validatePhoto({ ...photo, name: 'DIAL.JPEG' }), null);
  assert.equal(D.validatePhoto({ ...photo, name: 'case.png', type: 'image/png' }), null);
  assert.equal(D.validatePhoto({ ...photo, name: 'side.webp', type: 'image/webp' }), null);
});
test('photo validation rejects spoofed and executable extensions', () => {
  for (const name of ['dial.svg', 'dial.jpg.html', 'dial.exe', 'dial', 'dial.jpg\0', '../dial.php']) assert.ok(D.validatePhoto({ ...photo, name }));
  assert.ok(D.validatePhoto({ ...photo, type: 'image/png' }));
  assert.ok(D.validatePhoto({ ...photo, type: '' }));
});
test('photo validation bounds file size and rejects malformed values', () => {
  assert.equal(D.validatePhoto({ ...photo, size: D.MAX_PHOTO_BYTES }), null);
  for (const size of [0, -1, NaN, Infinity, '120', D.MAX_PHOTO_BYTES + 1]) assert.ok(D.validatePhoto({ ...photo, size }));
  assert.ok(D.validatePhoto(null));
});
test('demonstration valuation has transparent baseline and symmetric range', () => {
  const result = D.estimateValue(valuation);
  assert.equal(result.mid, 10000);
  assert.equal(result.low, 9400);
  assert.equal(result.high, 10600);
  assert.equal(result.simulated, true);
  assert.equal(result.adjustments.length, 4);
});
test('condition, documents and age change example valuation deterministically', () => {
  const result = D.estimateValue({ ...valuation, condition: 'Good', box: false, papers: false, year: 2021 });
  assert.equal(result.mid, 7400);
  assert.deepEqual(result, D.estimateValue({ ...valuation, condition: 'Good', box: false, papers: false, year: 2021 }));
  assert.ok(D.estimateValue({ ...valuation, condition: 'Unworn' }).mid > 10000);
});
test('valuation rejects invalid baseline, condition, year and document types', () => {
  for (const basePrice of [NaN, 0, -5, Infinity, '10000']) assert.throws(() => D.estimateValue({ ...valuation, basePrice }));
  for (const year of [NaN, '2024', 2028, 1899, 2024.5]) assert.throws(() => D.estimateValue({ ...valuation, year }));
  assert.throws(() => D.estimateValue({ ...valuation, condition: '__proto__' }));
  assert.throws(() => D.estimateValue({ ...valuation, papers: 'false' }));
});
test('search supports case-insensitive brand model and reference tokens', () => {
  assert.deepEqual(D.filterWatches(watches, { query: '  ROLEX 124060 ' }).map(x => x.id), ['one']);
  assert.deepEqual(D.filterWatches(watches, { query: '<script>' }), []);
});
test('filters combine price, brand, condition and box/papers constraints', () => {
  assert.deepEqual(D.filterWatches(watches, { maxPrice: 6000, fullSet: true }).map(x => x.id), ['three']);
  assert.deepEqual(D.filterWatches(watches, { brands: ['cartier'], condition: 'Very good' }).map(x => x.id), ['two']);
});
test('sorting is stable, meaningful and leaves input array unchanged', () => {
  assert.deepEqual(D.filterWatches(watches, { sort: 'price-asc' }).map(x => x.id), ['three', 'two', 'one']);
  assert.deepEqual(D.filterWatches(watches, { sort: 'price-desc' }).map(x => x.id), ['one', 'two', 'three']);
  assert.deepEqual(D.filterWatches(watches, { sort: 'newest' }).map(x => x.id), ['three', 'one', 'two']);
  assert.deepEqual(D.filterWatches(watches, { sort: 'value' }).map(x => x.id), ['one', 'three', 'two']);
  assert.deepEqual(watches.map(x => x.id), ['one', 'two', 'three']);
});
test('saved filtering uses explicit IDs and tolerates malformed options', () => {
  assert.deepEqual(D.filterWatches(watches, { savedOnly: true, savedIds: ['two'] }).map(x => x.id), ['two']);
  assert.deepEqual(D.filterWatches(watches, { savedOnly: true }), []);
  assert.equal(D.filterWatches(watches, { maxPrice: NaN, brands: null }).length, 3);
  assert.equal(D.filterWatches(watches, null).length, 3);
  assert.deepEqual(D.filterWatches(null), []);
  assert.equal(D.filterWatches([...watches, null, { price: NaN }]).length, 3);
});

const conditionReport = {
  condition: 'Very good', polishing: 'unpolished', wearHistory: 'worn', visibleWear: 'minor',
  conditionConfirmed: true, year: 2022, box: true, papers: true
};

test('an explicit consistent condition declaration validates without changing the input', () => {
  const input = { ...conditionReport };
  const before = structuredClone(input);
  const result = D.validateListingCondition(input);
  assert.equal(result.valid, true);
  assert.equal(result.unwornEligible, false);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(input, before);
});

test('Unworn requires unworn history, no polishing and no visible wear together', () => {
  const input = { ...conditionReport, condition: 'Unworn', wearHistory: 'unworn', polishing: 'unpolished', visibleWear: 'none' };
  assert.equal(D.validateListingCondition(input).valid, true);
  assert.equal(D.validateListingCondition(input).unwornEligible, true);
  for (const alternative of [
    { wearHistory: '' }, { wearHistory: 'worn' }, { wearHistory: 'unknown' },
    { polishing: '' }, { polishing: 'polished' }, { polishing: 'unknown' },
    { visibleWear: '' }, { visibleWear: 'minor' }, { visibleWear: 'visible' }
  ]) {
    const result = D.validateListingCondition({ ...input, ...alternative });
    assert.equal(result.valid, false, JSON.stringify(alternative));
    assert.equal(result.unwornEligible, false, JSON.stringify(alternative));
    assert.ok(result.errors.length > 0);
  }
});

test('visible wear prevents Excellent and Very good claims, while Good remains available', () => {
  for (const condition of ['Excellent', 'Very good']) {
    const result = D.validateListingCondition({ ...conditionReport, condition, visibleWear: 'visible' });
    assert.equal(result.valid, false, condition);
    assert.ok(result.errors.length > 0);
  }
  assert.equal(D.validateListingCondition({ ...conditionReport, condition: 'Good', visibleWear: 'visible' }).valid, true);
});

test('unknown history is explicit uncertainty rather than evidence for an Unworn claim', () => {
  const input = { ...conditionReport, condition: 'Good', wearHistory: 'unknown', polishing: 'unknown', visibleWear: 'visible' };
  const result = D.validateListingCondition(input);
  assert.equal(result.valid, true);
  assert.equal(result.unwornEligible, false);
  assert.equal(D.validateListingCondition({ ...input, condition: 'Unworn' }).valid, false);
});

test('condition confirmation requires true and cannot be replaced by publication confirmation', () => {
  for (const conditionConfirmed of [false, undefined, null, 'true', 1]) {
    const result = D.validateListingCondition({ ...conditionReport, conditionConfirmed, listingConfirmed: true });
    assert.equal(result.valid, false, String(conditionConfirmed));
    assert.ok(result.errors.length > 0);
  }
  assert.equal(D.validateListingCondition({ ...conditionReport, listingConfirmed: false }).valid, true);
});

test('condition validation rejects missing or unsupported disclosure choices and malformed details', () => {
  const invalid = [
    { condition: '' }, { condition: 'Mint' }, { condition: '__proto__' },
    { polishing: '' }, { polishing: 'never' }, { polishing: null },
    { wearHistory: '' }, { wearHistory: 'new' }, { wearHistory: null },
    { visibleWear: '' }, { visibleWear: 'unknown' }, { visibleWear: null },
    { year: '2022' }, { year: 1899 }, { year: 2028 }, { year: 2022.5 }, { year: NaN },
    { box: 'true' }, { papers: undefined }
  ];
  for (const alternative of invalid) {
    const result = D.validateListingCondition({ ...conditionReport, ...alternative });
    assert.equal(result.valid, false, JSON.stringify(alternative));
    assert.ok(result.errors.every(error => typeof error.field === 'string' && typeof error.message === 'string'));
    assert.ok(result.errors.length > 0);
  }
});
