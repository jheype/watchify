'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create: createPortfolio, AS_OF } = require('../src/portfolio-model.js');
const { create: createAnalytics } = require('../src/analytics-model.js');
const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const setup = () => {
  const state = {}, model = createPortfolio({ state, now: () => NOW });
  return { state, model, analytics: createAnalytics({ model }) };
};

test('empty analytics never substitutes sample ownership, costs, gains or performance', () => {
  const { state, analytics } = setup();
  const before = JSON.stringify(state);
  const data = analytics.collection();
  assert.deepEqual(data.gain, { knownCount: 0, totalCount: 0, costGBP: 0, valueGBP: 0, gainGBP: 0, gainPercent: null });
  assert.equal(data.summary.valueGBP, 0);
  assert.deepEqual(data.performance, { best: [], worst: [], unranked: [] });
  assert.deepEqual(data.allocation, []);
  assert.ok(data.benchmark.every(point => point.collectionIndex === null && Number.isFinite(point.marketIndex)));
  assert.equal(data.benchmark[0].marketIndex, 100);
  assert.equal(data.source, 'sample'); assert.equal(data.asOf, AS_OF);
  assert.match(data.methodology, /backcasts current holdings/);
  assert.equal(JSON.stringify(state), before);
});

test('partial costs, unknown costs, zero cost and duplicate references have distinct gain semantics', () => {
  const { model, analytics } = setup();
  const winner = model.add({ catalogueId: 'santos', purchasePriceGBP: 5000.25, purchaseDate: '2024-02' });
  model.add({ catalogueId: 'santos' });
  const gift = model.add({ catalogueId: 'submariner', purchasePriceGBP: 0 });
  const loser = model.add({ catalogueId: 'black-bay', purchasePriceGBP: 5000 });
  model.add({ catalogueId: 'speedmaster', purchasePriceGBP: null });
  const data = analytics.collection({ period: '1Y' });
  assert.equal(data.summary.count, 5);
  assert.equal(data.gain.knownCount, 3); assert.equal(data.gain.totalCount, 5);
  assert.equal(data.gain.costGBP, 10000.25);
  assert.equal(data.gain.valueGBP, 6350 + 10800 + 3100);
  assert.equal(data.gain.gainGBP, 10249.75);
  near(data.gain.gainPercent, (data.gain.valueGBP / 10000.25 - 1) * 100);
  assert.equal(data.performance.best[0].entryId, winner.id);
  assert.equal(data.performance.worst[0].entryId, loser.id);
  assert.deepEqual(data.performance.unranked.map(item => item.entryId), [gift.id]);
  assert.equal(data.performance.unranked[0].gainPercent, null);
  assert.equal(data.performance.unranked[0].gainGBP, 10800);
  assert.ok(data.performance.best.every(item => item.costGBP > 0));
  assert.ok(data.performance.worst.every(item => item.costGBP > 0));
  assert.equal(data.performance.best[0].purchaseDate, '2024-02');
  assert.deepEqual(analytics.collection({ period: '1M' }).gain, data.gain);
});

test('a zero-cost-only collection keeps the percentage undefined and out of best/worst rankings', () => {
  const { model, analytics } = setup();
  model.add({ catalogueId: 'santos', purchasePriceGBP: 0 });
  const data = analytics.collection();
  assert.equal(data.gain.knownCount, 1); assert.equal(data.gain.costGBP, 0);
  assert.equal(data.gain.gainGBP, 6350); assert.equal(data.gain.gainPercent, null);
  assert.deepEqual(data.performance.best, []); assert.deepEqual(data.performance.worst, []);
  assert.equal(data.performance.unranked.length, 1);
  assert.ok(Number.isFinite(data.summary.valueGBP));
});

test('purchase corrections update gain without changing valuations, allocation or sample indices', () => {
  const { model, analytics } = setup();
  const entry = model.add({ catalogueId: 'santos', year: 2022, set: 'watch', condition: 'Good' });
  const before = analytics.collection(); const index = analytics.index();
  model.updatePurchase(entry.id, { purchasePriceGBP: 5000.25, purchaseDate: '2026-11' });
  const after = analytics.collection();
  assert.deepEqual(after.summary, before.summary);
  assert.deepEqual(after.allocation, before.allocation);
  assert.deepEqual(after.benchmark, before.benchmark);
  assert.deepEqual(analytics.index(), index);
  assert.equal(after.gain.gainGBP, model.quote(entry).valueGBP - 5000.25);
  assert.equal(after.gain.knownCount, 1);
  model.updatePurchase(entry.id, { purchasePriceGBP: null });
  assert.equal(analytics.collection().gain.knownCount, 0);
});

test('brand allocation reconciles to private holdings and the selected period including duplicate pieces', () => {
  const { model, analytics } = setup();
  const first = model.add({ catalogueId: 'santos', condition: 'Good', set: 'watch' });
  const second = model.add({ catalogueId: 'santos', condition: 'Unworn' });
  model.add({ catalogueId: 'submariner' });
  const data = analytics.collection({ period: '6M' });
  near(data.allocation.reduce((sum, item) => sum + item.sharePercent, 0), 100);
  assert.equal(data.allocation.reduce((sum, item) => sum + item.valueGBP, 0), data.summary.valueGBP);
  assert.equal(data.allocation.reduce((sum, item) => sum + item.changeGBP, 0), data.summary.changeGBP);
  const cartier = data.allocation.find(item => item.brand === 'Cartier');
  assert.deepEqual(cartier.entries, [first.id, second.id]); assert.equal(cartier.count, 2);
  const expected = model.summary([first, second], '6M');
  assert.equal(cartier.valueGBP, expected.valueGBP); assert.equal(cartier.changePercent, expected.changePercent);
});

test('all brand and overall indices share their historical origin and their weights and contributions reconcile', () => {
  const { model, analytics } = setup();
  const brands = ['all', ...new Set(model.catalogue().map(watch => watch.brand))];
  for (const brand of brands) {
    const full = analytics.index({ brand, period: 'All' });
    assert.equal(full.baseDate, '2024-11-20'); assert.equal(full.points[0].date, full.baseDate);
    assert.equal(full.points[0].value, 100);
    for (const period of ['1M', '6M', '1Y', 'All']) {
      const data = analytics.index({ brand, period });
      assert.equal(data.value, full.value);
      assert.equal(data.points.at(-1).date, AS_OF);
      assert.equal(data.constituents.length, model.catalogue().filter(watch => brand === 'all' || watch.brand === brand).length);
      near(data.constituents.reduce((sum, member) => sum + member.weightPercent, 0), 100);
      near(data.constituents.reduce((sum, member) => sum + member.periodWeightPercent, 0), 100);
      near(data.constituents.reduce((sum, member) => sum + member.currentWeightPercent, 0), 100);
      near(data.constituents.reduce((sum, member) => sum + member.contributionPercent, 0), data.changePercent);
      near((data.points.at(-1).value / data.points[0].value - 1) * 100, data.changePercent);
      near(data.points.at(-1).value - data.points[0].value, data.changePoints);
      for (const member of data.constituents) {
        assert.equal(member.id, member.catalogueId);
        assert.equal(member.source, 'sample'); assert.equal(member.asOf, AS_OF);
        near(member.periodWeightPercent / 100 * member.changePercent, member.contributionPercent);
      }
    }
  }
});

test('one unit of every reference exactly tracks the same market benchmark for every period', () => {
  const { model, analytics } = setup();
  for (const watch of model.catalogue()) model.add({ catalogueId: watch.id, year: watch.year, set: 'full', condition: 'Excellent' });
  for (const period of ['1M', '6M', '1Y', 'All']) {
    const data = analytics.collection({ period });
    const index = analytics.index({ period });
    assert.equal(data.benchmark.length, model.history({ entries: model.collection(), period }).length);
    assert.deepEqual(data.benchmark.map(point => point.date), index.points.map(point => point.date));
    assert.equal(data.benchmark[0].collectionIndex, 100); assert.equal(data.benchmark[0].marketIndex, 100);
    for (let position = 0; position < data.benchmark.length; position++) {
      near(data.benchmark[position].collectionIndex, data.benchmark[position].marketIndex);
      near(data.benchmark[position].marketIndex, index.points[position].value / index.points[0].value * 100);
    }
  }
});

test('the index uses fixed sample references independently of private ownership and exposes detached results', () => {
  const { model, analytics } = setup();
  const baseline = analytics.index();
  model.add({ catalogueId: 'royal-oak', condition: 'Good', purchasePriceGBP: 1 });
  model.add({ catalogueId: 'royal-oak', condition: 'Good', purchasePriceGBP: 2 });
  assert.deepEqual(analytics.index(), baseline);
  const changed = analytics.index(); changed.points[0].value = 1; changed.constituents[0].brand = 'Altered';
  assert.deepEqual(analytics.index(), baseline);
  const benchmark = analytics.collection().benchmark;
  assert.ok(benchmark.some(point => Math.abs(point.collectionIndex - point.marketIndex) > 0.01));
});

test('market movers use actual available sample references and consistent week, month and year returns', () => {
  const { model, analytics } = setup();
  for (const period of ['week', 'month', 'year']) {
    for (const direction of ['rising', 'falling']) {
      const data = analytics.marketMovers({ period, direction });
      assert.ok(data.items.length <= 8 && data.items.length <= 10);
      assert.equal(new Set(data.items.map(item => item.id)).size, data.items.length);
      for (let position = 0; position < data.items.length; position++) {
        const item = data.items[position], watch = model.find(item.id);
        const expected = period === 'week' ? watch.changeWeek : period === 'month' ? watch.changeMonth : model.summary([{ catalogueId: watch.id }], '1Y').changePercent;
        assert.equal(item.changePercent, expected);
        assert.equal(item.valueGBP - item.previousGBP, item.changeGBP);
        assert.ok(direction === 'rising' ? item.changeGBP > 0 : item.changeGBP < 0);
        assert.equal(item.source, 'sample'); assert.equal(item.asOf, AS_OF);
        if (position) assert.ok(direction === 'rising' ? data.items[position - 1].changePercent >= item.changePercent : data.items[position - 1].changePercent <= item.changePercent);
      }
    }
  }
  assert.ok(analytics.marketMovers({ brand: 'Rolex' }).items.every(item => item.brand === 'Rolex'));
});

test('liquidity and supply are deterministic dated sample data with a coherent 30-day change', () => {
  const { model, analytics } = setup();
  const categories = new Set();
  for (const watch of model.catalogue()) {
    const monthly = analytics.trading(watch.id, { period: '1M' });
    const annual = analytics.trading(watch.id, { period: '1Y' });
    categories.add(monthly.liquidityLabel);
    assert.equal(monthly.points.at(-1).numberListed, monthly.supply);
    assert.equal(monthly.supplyChange30d, monthly.supply - monthly.points[0].numberListed);
    near(monthly.supplyChange30dPercent, (monthly.supply / monthly.points[0].numberListed - 1) * 100);
    assert.equal(annual.supplyChange30d, monthly.supplyChange30d);
    assert.equal(annual.medianDays, monthly.medianDays);
    assert.deepEqual(annual.points.map(point => point.date), model.history({ catalogueId: watch.id, period: '1Y' }).map(point => point.date));
    assert.ok(annual.points.every(point => Number.isInteger(point.numberListed) && point.numberListed > 0));
    assert.equal(monthly.source, 'sample'); assert.equal(monthly.asOf, AS_OF);
    assert.match(monthly.methodology, /not observed sales or listings/);
    assert.deepEqual(analytics.trading(watch.id, { period: '1M' }), monthly);
  }
  assert.deepEqual([...categories].sort(), ['Average', 'Fast', 'Slow']);
});

test('unknown periods, brands, references and untrusted option fields are rejected without state mutation', () => {
  const { state, analytics } = setup(); const original = JSON.stringify(state);
  assert.throws(() => analytics.collection({ period: 'week' }), { code: 'ANALYTICS_PERIOD' });
  assert.throws(() => analytics.index({ brand: 'Unknown' }), { code: 'ANALYTICS_BRAND' });
  assert.throws(() => analytics.marketMovers({ period: '1M' }), { code: 'ANALYTICS_PERIOD' });
  assert.throws(() => analytics.marketMovers({ direction: 'sideways' }), { code: 'ANALYTICS_DIRECTION' });
  assert.throws(() => analytics.trading('__proto__'), { code: 'ANALYTICS_REFERENCE' });
  assert.throws(() => analytics.index({ period: '6M', extra: true }), { code: 'ANALYTICS_INVALID' });
  assert.throws(() => analytics.collection(null), { code: 'ANALYTICS_INVALID' });
  assert.throws(() => analytics.index(JSON.parse('{"__proto__":{"polluted":true}}')), { code: 'ANALYTICS_INVALID' });
  const accessor = {};
  Object.defineProperty(accessor, 'period', { enumerable: true, get: () => assert.fail('An option accessor must not execute') });
  assert.throws(() => analytics.index(accessor), { code: 'ANALYTICS_INVALID' });
  assert.equal({}.polluted, undefined); assert.equal(JSON.stringify(state), original);
});

test('incompatible history dates fail explicitly instead of plotting misleading comparisons', () => {
  const { model } = setup();
  const shifted = { ...model, history(input) {
    const points = model.history(input);
    if (input.catalogueId === 'santos' && input.period === '6M') points[0].date = '2026-05-19';
    return points;
  } };
  const analytics = createAnalytics({ model: shifted });
  assert.throws(() => analytics.index({ period: '6M' }), { code: 'ANALYTICS_DATA' });
});
