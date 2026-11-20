'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDeclarations, buildIndication, ValuationError } = require('../server/valuation.cjs');

const NOW = Date.parse('2026-11-09T12:00:00.000Z');
const DAY = 86400000;
const REFERENCE = '126610LN';
function price(changes = {}) {
  return { status: 'available', source: 'talia', catalogId: 'exact-2024-reference', currency: 'GBP',
    marketPrice: 10000, lowerBound: 9000, upperBound: 11000, basis: 'market_quote', reviewStatus: 'validated',
    asOf: '2026-11-08T12:00:00.000Z', recordUpdatedAt: '2026-11-09T11:00:00.000Z', basedOnHistoricData: false, ...changes };
}
function analysis(changes = {}) {
  return { photoQuality: { usable: true }, candidates: [{ reference: REFERENCE, confidence: 'high' }], observations: [],
    condition: { suggestedGrade: 'Excellent', visibleWear: 'none' }, polishing: { assessment: 'not_determinable', evidence: [] }, ...changes };
}
function declarations(changes = {}) {
  return { condition: 'Excellent', polishing: 'unpolished', wearHistory: 'worn', visibleWear: 'none',
    box: true, papers: true, conditionConfirmed: true, ...changes };
}
function noIndication(result) {
  assert.equal(result.indicativeLow, null);
  assert.equal(result.indicativeMid, null);
  assert.equal(result.indicativeHigh, null);
  assert.deepEqual(result.adjustments, []);
  assert.equal(result.reviewRequired, true);
}
const adjusted = (p, a, d) => buildIndication(p, a, d, NOW, 'excellent_full_set', REFERENCE);

test('unspecified trade baseline returns reference only even when photos and declarations are complete', () => {
  const upstream = price();
  const result = buildIndication(upstream, analysis(), declarations({ box: false, papers: false }), NOW, undefined, REFERENCE);
  assert.equal(result.status, 'reference_only');
  noIndication(result);
  assert.equal(result.marketPrice, 10000);
  assert.equal(result.lowerBound, 9000);
  assert.equal(result.currency, 'GBP');
  assert.match(result.warnings.join(' '), /baseline is unspecified/i);
  assert.equal(upstream.status, 'available');
  assert.equal(upstream.adjustments, undefined);
});

test('an unsupported baseline cannot enable experimental adjustments', () => {
  for (const baseline of ['', null, 'new_full_set', 'excellent', 'EXCELLENT_FULL_SET']) {
    const result = buildIndication(price(), analysis(), declarations(), NOW, baseline, REFERENCE);
    assert.equal(result.status, 'reference_only');
    noIndication(result);
  }
});

test('explicit baseline uses the worse supported grade with independently declared accessories', () => {
  const result = adjusted(price(), analysis({ condition: { suggestedGrade: 'Very good', visibleWear: 'minor' } }),
    declarations({ condition: 'Good', visibleWear: 'visible', box: false, papers: false }));
  assert.equal(result.effectiveGrade, 'Good');
  assert.equal(result.indicativeMid, 8300);
  assert.equal(result.indicativeLow, 7470);
  assert.equal(result.indicativeHigh, 9130);
  assert.deepEqual(result.adjustments.map(item => item.percent), [-10, -2, -5]);
  assert.equal(result.marketPrice, 10000);
  assert.equal(result.reviewRequired, true);
  assert.match(result.warnings.join(' '), /experimental/i);
  const worsePhotoGrade = adjusted(price(), analysis({ condition: { suggestedGrade: 'Good', visibleWear: 'visible' } }), declarations());
  assert.equal(worsePhotoGrade.effectiveGrade, 'Good');
  assert.equal(worsePhotoGrade.indicativeMid, 9000);
});

test('polishing and age do not introduce extra automatic price deductions', () => {
  const clean = adjusted(price(), analysis(), declarations());
  const polished = adjusted(price(), analysis({ polishing: { assessment: 'possible', evidence: ['Soft edge'] } }), declarations({ polishing: 'polished' }));
  assert.equal(polished.indicativeMid, clean.indicativeMid);
  assert.deepEqual(polished.adjustments, clean.adjustments);
});

test('range-only reference stays range-only upstream, and a missing range is never fabricated', () => {
  const rangeOnly = adjusted(price({ marketPrice: null }), analysis(), declarations());
  assert.equal(rangeOnly.marketPrice, null);
  assert.equal(rangeOnly.lowerBound, 9000);
  assert.equal(rangeOnly.upperBound, 11000);
  assert.equal(rangeOnly.indicativeLow, 9000);
  assert.equal(rangeOnly.indicativeHigh, 11000);
  const centreOnly = adjusted(price({ lowerBound: null, upperBound: null }), analysis(), declarations());
  assert.equal(centreOnly.indicativeMid, 10000);
  assert.equal(centreOnly.indicativeLow, null);
  assert.equal(centreOnly.indicativeHigh, null);
});

test('an adjusted indication requires a high-confidence match to the exact selected reference', () => {
  for (const candidates of [[], [{ reference: REFERENCE, confidence: 'medium' }], [{ reference: '126334', confidence: 'high' }],
    [{ reference: null, confidence: 'high' }], [{ reference: REFERENCE, confidence: 'low' }, { reference: '126334', confidence: 'high' }]]) {
    const result = adjusted(price(), analysis({ candidates }), declarations());
    assert.equal(result.status, 'review_required');
    noIndication(result);
  }
  const normalized = buildIndication(price(), analysis({ candidates: [{ reference: '126.610-ln', confidence: 'high' }] }), declarations(), NOW, 'excellent_full_set', '126610LN');
  assert.equal(normalized.indicativeMid, 10000);
});

test('unavailable provider states never produce an adjusted amount', () => {
  for (const status of ['paused', 'withdrawn', 'unavailable', 'not_found', 'ambiguous']) {
    const result = adjusted(price({ status, marketPrice: null, lowerBound: null, upperBound: null }), analysis(), declarations());
    assert.equal(result.status, status);
    noIndication(result);
  }
});

test('unknown basis, disputed review and absent calculation date prevent an indication', () => {
  for (const change of [{ basis: 'unknown' }, { reviewStatus: 'disputed' }, { asOf: null }, { asOf: '' }, { asOf: 'not-a-date' }]) {
    const result = adjusted(price(change), analysis(), declarations());
    assert.equal(result.status, 'review_required');
    noIndication(result);
  }
});

test('freshness uses the source calculation date, not the CRM row update timestamp', () => {
  for (const asOf of [new Date(NOW - 30 * DAY - 1).toISOString(), new Date(NOW + 300001).toISOString()]) {
    const result = adjusted(price({ asOf, recordUpdatedAt: new Date(NOW).toISOString() }), analysis(), declarations());
    assert.equal(result.status, 'stale');
    noIndication(result);
  }
  const current = adjusted(price({ asOf: new Date(NOW - 29 * DAY).toISOString() }), analysis(), declarations());
  assert.equal(current.indicativeMid, 10000);
});

test('model, unreviewed and historical provenance remain explicit with an experimental indication', () => {
  const result = adjusted(price({ basis: 'model_estimate', reviewStatus: 'unreviewed', basedOnHistoricData: true }), analysis(), declarations());
  assert.equal(result.basis, 'model_estimate');
  assert.equal(result.reviewStatus, 'unreviewed');
  assert.match(result.warnings.join(' '), /provider model estimate/i);
  assert.match(result.warnings.join(' '), /not been independently validated/i);
  assert.match(result.warnings.join(' '), /historical data/i);
});

test('unknown condition evidence cannot produce an indication even with an explicit baseline', () => {
  for (const condition of [{ suggestedGrade: 'unknown', visibleWear: 'visible' }, { suggestedGrade: 'Excellent', visibleWear: 'unknown' }]) {
    const result = adjusted(price(), analysis({ condition }), declarations());
    assert.equal(result.status, 'review_required');
    noIndication(result);
  }
});

test('declarations retain strict confirmation, accessory and year validation', () => {
  for (const change of [{ conditionConfirmed: false }, { conditionConfirmed: 'true' }, { box: 'true' }, { papers: undefined }, { polishing: '' }]) {
    assert.throws(() => checkDeclarations(analysis(), declarations(change), 2024), error => error instanceof ValuationError && error.code === 'INVALID_DECLARATIONS');
  }
  assert.throws(() => checkDeclarations(analysis(), declarations(), '2024'), { code: 'INVALID_DECLARATIONS' });
  assert.equal(checkDeclarations(analysis(), declarations(), 2024), true);
});

test('unusable photographs cannot proceed to valuation', () => {
  assert.throws(() => checkDeclarations(analysis({ photoQuality: { usable: false } }), declarations(), 2024), { code: 'MORE_PHOTOS_REQUIRED' });
});

test('heavy or moderate observations override an inconsistent no-wear summary and reject Unworn', () => {
  const unworn = declarations({ condition: 'Unworn', wearHistory: 'unworn', visibleWear: 'none', polishing: 'unpolished' });
  for (const severity of ['moderate', 'heavy']) {
    const contradictory = analysis({ observations: [{ component: 'Case', severity, description: 'Visible damage' }] });
    assert.throws(() => checkDeclarations(contradictory, unworn, 2024), { code: 'CONDITION_CONFLICT' });
    assert.throws(() => checkDeclarations(contradictory, declarations({ visibleWear: 'none' }), 2024), { code: 'CONDITION_CONFLICT' });
    assert.equal(checkDeclarations(contradictory, declarations({ condition: 'Good', visibleWear: 'visible' }), 2024), true);
  }
});

test('minor observations cannot be hidden by a summary saying no marks', () => {
  const minor = analysis({ observations: [{ component: 'Clasp', severity: 'minor', description: 'Hairline scratches' }] });
  assert.throws(() => checkDeclarations(minor, declarations({ visibleWear: 'none' }), 2024), { code: 'CONDITION_CONFLICT' });
  assert.equal(checkDeclarations(minor, declarations({ visibleWear: 'minor' }), 2024), true);
});

test('possible polishing conflicts with an unpolished declaration; uncertainty remains an honest option', () => {
  const possible = analysis({ polishing: { assessment: 'possible', evidence: ['Softened case edge'] } });
  assert.throws(() => checkDeclarations(possible, declarations({ polishing: 'unpolished' }), 2024), { code: 'POLISHING_CONFLICT' });
  assert.equal(checkDeclarations(possible, declarations({ polishing: 'unknown' }), 2024), true);
  assert.equal(checkDeclarations(possible, declarations({ polishing: 'polished' }), 2024), true);
});

test('Good photo assessment prevents an optimistic declared grade', () => {
  const worn = analysis({ condition: { suggestedGrade: 'Good', visibleWear: 'minor' } });
  assert.throws(() => checkDeclarations(worn, declarations({ condition: 'Excellent', visibleWear: 'minor' }), 2024), { code: 'CONDITION_CONFLICT' });
  assert.equal(checkDeclarations(worn, declarations({ condition: 'Good', visibleWear: 'minor' }), 2024), true);
});

test('a Very good photo grade cannot approve Unworn through an inconsistent no-wear summary', () => {
  const uncertainWear = analysis({ condition: { suggestedGrade: 'Very good', visibleWear: 'none' } });
  const unworn = declarations({ condition: 'Unworn', wearHistory: 'unworn', visibleWear: 'none', polishing: 'unpolished' });
  assert.throws(() => checkDeclarations(uncertainWear, unworn, 2024), { code: 'CONDITION_CONFLICT' });
});
