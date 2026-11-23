'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create, validate, AS_OF, VERSION, LIMITS } = require('../src/portfolio-model.js');
require('../src/data.js');

const NOW = Date.parse('2026-11-22T12:00:00.000Z');
const setup = state => {
  state ||= {};
  return { state, model: create({ state, now: () => NOW }) };
};
const percentage = (current, previous) => previous === 0 ? 0 : Math.round((current - previous) / previous * 10000) / 100;

test('a fresh private portfolio never imports fictional ownership and does not alter legacy records', () => {
  const state = { watches: structuredClone(globalThis.WatchifyData.watches), saved: ['submariner'], member: { profile: { nickname: 'Private tester' } } };
  const legacy = structuredClone(state);
  const { model } = setup(state);
  assert.deepEqual(model.collection(), []);
  assert.deepEqual(model.following(), []);
  assert.deepEqual(model.rules(), []);
  assert.deepEqual(model.alerts(), []);
  assert.deepEqual(model.preferences(), { weeklyDigest: true, priceAlerts: true });
  assert.deepEqual({ watches: state.watches, saved: state.saved, member: state.member }, legacy);
  assert.equal(state.portfolio.version, VERSION);
  assert.equal(model.summary().valueGBP, 0);
  assert.equal(model.summary().changePercent, 0);
  assert.equal(model.digest().topMover, null);
  assert.ok(model.history().every(point => point.valueGBP === 0));
});

test('all eight references retain their known GBP baselines and explicit sample provenance', () => {
  const { model } = setup();
  const catalogue = model.catalogue();
  assert.equal(catalogue.length, 8);
  assert.equal(new Set(catalogue.map(watch => watch.id)).size, 8);
  for (const watch of catalogue) {
    const fixture = globalThis.WatchifyData.watches.find(item => item.id === watch.id);
    assert.equal(watch.reference, fixture.reference);
    assert.equal(watch.valueGBP, fixture.marketPrice);
    assert.equal(watch.image, fixture.image);
    assert.equal(watch.source, 'sample'); assert.equal(watch.asOf, AS_OF); assert.equal(watch.currency, 'GBP');
    assert.ok(watch.lowGBP <= watch.valueGBP && watch.highGBP >= watch.valueGBP);
    assert.equal(Object.hasOwn(watch, 'owned'), false);
    assert.deepEqual(watch.regions.map(region => region.id), ['uk', 'us', 'hk']);
    for (const region of watch.regions) {
      assert.equal(region.currency, 'GBP'); assert.equal(region.source, 'sample');
      assert.equal(region.valueGBP, Math.round(watch.valueGBP * (1 + region.premiumPercent / 100)));
    }
  }
  catalogue[0].regions[0].valueGBP = 1;
  catalogue[0].brand = 'Mutated result';
  assert.equal(model.find('submariner').brand, 'Rolex');
  assert.equal(model.find('submariner').regions[0].valueGBP, 10800);
  assert.equal(model.find('missing'), null); assert.equal(model.find('__proto__'), null);
});

test('period curves, quoted changes and portfolio totals use the same dated sample values', () => {
  const { model } = setup();
  const entries = [
    model.add({ catalogueId: 'submariner', year: 2021, set: 'papers', condition: 'Good' }),
    model.add({ catalogueId: 'santos', year: 2018, set: 'full', condition: 'Unworn' }),
    model.add({ catalogueId: 'submariner', year: 2023, set: 'full', condition: 'Excellent' })
  ];
  for (const period of ['1M', '6M', '1Y', 'All']) {
    const history = model.history({ entries, period });
    const total = model.summary(entries, period);
    assert.equal(history[0].valueGBP, total.previousGBP);
    assert.equal(history.at(-1).valueGBP, total.valueGBP);
    assert.equal(history.at(-1).date, AS_OF);
    assert.equal(total.valueGBP, entries.reduce((sum, entry) => sum + model.quote(entry).valueGBP, 0));
    assert.equal(total.lowGBP, entries.reduce((sum, entry) => sum + model.quote(entry).lowGBP, 0));
    assert.equal(total.highGBP, entries.reduce((sum, entry) => sum + model.quote(entry).highGBP, 0));
    assert.equal(total.changeGBP, total.valueGBP - total.previousGBP);
    assert.equal(total.changePercent, percentage(total.valueGBP, total.previousGBP));
    assert.equal(total.count, 3); assert.equal(total.valuedCount, 3);
    assert.ok(history.every((point, index) => Number.isFinite(point.valueGBP) && point.valueGBP >= 0 && (index === 0 || point.date > history[index - 1].date)));
    for (let index = 0; index < history.length; index++) {
      assert.equal(history[index].valueGBP, entries.reduce((sum, entry) => sum + model.history({ entries: [entry], period })[index].valueGBP, 0));
    }
  }
  for (const watch of model.catalogue()) {
    for (const [period, field] of [['1M', 'changeMonth'], ['6M', 'change6M']]) {
      const curve = model.history({ catalogueId: watch.id, period });
      assert.equal(watch[field], percentage(curve.at(-1).valueGBP, curve[0].valueGBP));
    }
    const month = model.history({ catalogueId: watch.id });
    const weekStart = month.find(point => point.date === '2026-11-13');
    assert.equal(watch.changeWeek, percentage(watch.valueGBP, weekStart.valueGBP));
  }
});

test('quotes respond to explicit declarations without claiming inspection or changing the baseline', () => {
  const { model } = setup();
  const full = model.quote({ catalogueId: 'datejust' });
  const watchOnly = model.quote({ catalogueId: 'datejust', set: 'watch' });
  const good = model.quote({ catalogueId: 'datejust', condition: 'Good' });
  const unworn = model.quote({ catalogueId: 'datejust', condition: 'Unworn' });
  const older = model.quote({ catalogueId: 'datejust', year: 2010 });
  assert.ok(watchOnly.valueGBP < full.valueGBP);
  assert.ok(good.valueGBP < full.valueGBP && unworn.valueGBP > full.valueGBP);
  assert.ok(older.valueGBP < full.valueGBP);
  assert.equal(model.find('datejust').valueGBP, 11600);
  assert.equal(unworn.source, 'sample');
  assert.equal(Object.hasOwn(unworn, 'verified'), false);
});

test('CRUD uses unique immutable-in-result IDs and keeps serials and photos private to state', () => {
  const { model, state } = setup();
  const photo = 'data:image/jpeg;base64,/9j/4AECAw==';
  const entry = model.add({ catalogueId: 'santos', image: photo, serial: '  A123  ', serviceHistory: 'Serviced in 2025\nReceipt kept privately.' });
  const rule = model.addRule({ catalogueId: 'santos', direction: 'above', targetGBP: 6000 });
  const another = model.add({ catalogueId: 'santos' });
  assert.deepEqual([entry.id, rule.id, another.id], ['pc-1', 'pr-2', 'pc-3']);
  assert.equal(entry.serial, 'A123'); assert.equal(entry.addedAt, new Date(NOW).toISOString());
  entry.serial = 'Changed outside model';
  assert.equal(model.collection()[0].serial, 'A123');
  assert.equal(model.collection()[0].image, photo);
  assert.ok(!JSON.stringify(model.catalogue()).includes('A123'));
  const reloaded = create({ state: structuredClone(state), now: () => NOW });
  assert.deepEqual(reloaded.collection(), model.collection());
  assert.deepEqual(reloaded.rules(), model.rules());
  assert.equal(model.remove(entry.id), true); assert.equal(model.remove(entry.id), false);
  assert.equal(model.add({ catalogueId: 'santos' }).id, 'pc-4');
});

test('rules trigger against sample reference prices, read state survives reload and preferences are real', () => {
  const { model, state } = setup();
  const owned = model.add({ catalogueId: 'submariner' });
  const triggered = model.addRule({ catalogueId: 'submariner', direction: 'above', targetGBP: 10800 });
  model.addRule({ catalogueId: 'submariner', direction: 'below', targetGBP: 10000 });
  assert.equal(model.toggleFollow('submariner'), true);
  const alerts = model.alerts();
  assert.deepEqual(alerts.map(alert => alert.type), ['price', 'price', 'market', 'digest']);
  for (const alert of alerts) {
    assert.equal(alert.source, 'sample'); assert.equal(alert.asOf, AS_OF); assert.equal(alert.read, false);
    assert.equal(model.markRead(alert.id), true);
  }
  assert.equal(model.markRead('unknown'), false);
  assert.equal(model.markRead(alerts[0].id), true);
  assert.equal(state.portfolio.readAlerts.length, 4);
  assert.ok(create({ state: structuredClone(state), now: () => NOW }).alerts().every(alert => alert.read));
  assert.equal(model.digest().changePercent, model.find('submariner').changeWeek);
  assert.equal(model.digest().topMover.catalogueId, 'submariner');
  assert.equal(model.digest().watchCount, 1);
  assert.deepEqual(model.preferences({ priceAlerts: false }), { weeklyDigest: true, priceAlerts: false });
  assert.deepEqual(model.alerts().map(alert => alert.type), ['digest']);
  model.preferences({ weeklyDigest: false }); assert.deepEqual(model.alerts(), []);
  model.preferences({ priceAlerts: true, weeklyDigest: true });
  assert.equal(model.removeRule(triggered.id), true);
  assert.equal(model.removeRule(triggered.id), false);
  assert.equal(model.toggleFollow('submariner'), false);
  assert.deepEqual(state.portfolio.readAlerts, ['price-' + owned.id, 'digest-' + AS_OF]);
  model.remove(owned.id);
  assert.deepEqual(state.portfolio.readAlerts, ['digest-' + AS_OF]);
  assert.doesNotThrow(() => validate(state.portfolio, { now: () => NOW }));
});

test('invalid entries, unsafe images and malformed targets fail before any state mutation', () => {
  const { model, state } = setup();
  const original = JSON.stringify(state);
  const inputs = [
    { catalogueId: 'missing' }, { catalogueId: '__proto__' }, { catalogueId: 'santos', year: 1899 },
    { catalogueId: 'santos', year: 2027 }, { catalogueId: 'santos', year: NaN }, { catalogueId: 'santos', year: '2020' },
    { catalogueId: 'santos', condition: 'Verified' }, { catalogueId: 'santos', set: 'box' },
    { catalogueId: 'santos', serial: '<img src=x>' }, { catalogueId: 'santos', serial: 'x'.repeat(121) },
    { catalogueId: 'santos', serviceHistory: 'x'.repeat(2001) }, { catalogueId: 'santos', owned: true },
    ...['https://example.test/watch.jpg', '//example.test/watch.jpg', 'javascript:alert(1)', 'assets/../private.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AAA', 'blob:other-session'].map(image => ({ catalogueId: 'santos', image }))
  ];
  for (const input of inputs) { assert.throws(() => model.add(input)); assert.equal(JSON.stringify(state), original); }
  for (const targetGBP of [99, 1000001, 100.5, NaN, Infinity, '10800', null]) {
    assert.throws(() => model.addRule({ catalogueId: 'submariner', direction: 'above', targetGBP }), { code: 'PORTFOLIO_TARGET' });
    assert.equal(JSON.stringify(state), original);
  }
  assert.throws(() => model.addRule({ catalogueId: 'submariner', direction: 'sideways', targetGBP: 10800 }), { code: 'PORTFOLIO_TARGET' });
  assert.throws(() => model.history({ catalogueId: 'submariner', entries: [] }));
  assert.throws(() => model.history({ period: 'today' }), { code: 'PORTFOLIO_PERIOD' });
  assert.throws(() => model.preferences({ priceAlerts: 'true' }));
  assert.throws(() => model.preferences({ email: 'elsewhere@example.test' }));
  assert.equal(JSON.stringify(state), original);
});

test('restored portfolios reject unsupported versions, duplicate IDs and malformed private state without resetting it', () => {
  const { model, state } = setup();
  model.add({ catalogueId: 'santos' }); model.addRule({ catalogueId: 'santos', direction: 'below', targetGBP: 5000 });
  const cases = [
    value => { value.version = 2; }, value => { value.collection.push(structuredClone(value.collection[0])); },
    value => { value.rules.push(structuredClone(value.rules[0])); }, value => { value.nextId = 1; },
    value => { value.nextId = Infinity; }, value => { value.following = ['santos', 'santos']; },
    value => { value.following = ['unknown']; }, value => { value.readAlerts = ['price-pr-999']; },
    value => { value.preferences.weeklyDigest = 1; }, value => { value.collection[0].image = 'https://example.test/a.png'; },
    value => { value.collection[0].year = undefined; }, value => { value.collection[0].addedAt = '2026-02-30T00:00:00.000Z'; },
    value => { value.collection[0].extra = true; }, value => { value.rules[0].targetGBP = 0; }
  ];
  for (const edit of cases) {
    const candidate = structuredClone(state); edit(candidate.portfolio);
    const before = structuredClone(candidate);
    assert.throws(() => create({ state: candidate, now: () => NOW }));
    assert.deepEqual(candidate, before);
  }
  const duplicate = model.collection(); duplicate.push(duplicate[0]);
  assert.throws(() => model.summary(duplicate));
});

test('prototype keys, accessors, sparse lists and oversized inputs cannot enter the model', () => {
  const { model, state } = setup();
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const input = JSON.parse('{"catalogueId":"santos","' + key + '":{"polluted":true}}');
    assert.throws(() => model.add(input), { code: 'PORTFOLIO_INVALID' });
    const value = structuredClone(state.portfolio);
    Object.defineProperty(value.preferences, key, { value: {}, enumerable: true });
    assert.throws(() => validate(value, { now: () => NOW }), { code: 'PORTFOLIO_INVALID' });
  }
  assert.equal({}.polluted, undefined);
  const getters = { catalogueId: 'santos' };
  Object.defineProperty(getters, 'image', { enumerable: true, get: () => assert.fail('An accessor must not execute') });
  assert.throws(() => model.add(getters), { code: 'PORTFOLIO_INVALID' });
  const sparse = structuredClone(state.portfolio); sparse.collection = new Array(1);
  assert.throws(() => validate(sparse, { now: () => NOW }));
  const excessive = structuredClone(state.portfolio); excessive.collection = new Array(LIMITS.collection + 1).fill({});
  assert.throws(() => validate(excessive, { now: () => NOW }), { code: 'PORTFOLIO_LIMIT' });
  const hidden = structuredClone(state.portfolio);
  Object.defineProperty(hidden.following, 'constructor', { value: {}, enumerable: false });
  assert.throws(() => validate(hidden, { now: () => NOW }), { code: 'PORTFOLIO_INVALID' });
});

test('collection limits and duplicate rule checks preserve state and never reuse IDs', () => {
  const { model, state } = setup();
  for (let i = 0; i < LIMITS.collection; i++) model.add({ catalogueId: 'santos' });
  const before = JSON.stringify(state);
  assert.throws(() => model.add({ catalogueId: 'santos' }), { code: 'PORTFOLIO_LIMIT' });
  assert.equal(JSON.stringify(state), before);
  model.addRule({ catalogueId: 'santos', direction: 'below', targetGBP: 5000 });
  const afterRule = JSON.stringify(state);
  assert.throws(() => model.addRule({ catalogueId: 'santos', direction: 'below', targetGBP: 5000 }), { code: 'PORTFOLIO_DUPLICATE' });
  assert.equal(JSON.stringify(state), afterRule);
});

test('a later clock permits a later manufacture year without moving the sample market date', () => {
  const model = create({ state: {}, now: () => Date.parse('2028-02-01T00:00:00Z') });
  const entry = model.add({ catalogueId: 'santos', year: 2028 });
  assert.equal(model.quote(entry).asOf, AS_OF);
  assert.equal(model.find('santos').valueGBP, 6350);
  assert.throws(() => model.add({ catalogueId: 'santos', year: 2029 }), { code: 'PORTFOLIO_YEAR' });
});

test('the collection digest never labels a followed but unowned reference as its top mover', () => {
  const { model } = setup();
  const owned = model.add({ catalogueId: 'santos' });
  model.toggleFollow('black-bay');
  assert.ok(Math.abs(model.find('black-bay').changeWeek) > Math.abs(model.find('santos').changeWeek));
  const digest = model.digest();
  assert.equal(digest.watchCount, 1);
  assert.equal(digest.valueGBP, 6350);
  assert.equal(digest.topMover.catalogueId, 'santos');
  model.remove(owned.id);
  assert.deepEqual(model.following(), ['black-bay']);
  assert.equal(model.digest().watchCount, 0);
  assert.equal(model.digest().topMover, null);
});

test('automatic sample price alerts use each owned piece and never infer ownership from fixtures or following', () => {
  const { model, state } = setup({ watches: structuredClone(globalThis.WatchifyData.watches) });
  model.toggleFollow('black-bay');
  assert.equal(model.alerts().filter(alert => alert.type === 'price').length, 0);
  const first = model.add({ catalogueId: 'santos', year: 2022, set: 'watch', condition: 'Good' });
  const second = model.add({ catalogueId: 'santos', year: 2018, set: 'full', condition: 'Unworn' });
  const alerts = model.alerts().filter(alert => alert.collectionId);
  assert.equal(alerts.length, 2);
  assert.notEqual(alerts[0].id, alerts[1].id);
  assert.notEqual(alerts[0].valueGBP, alerts[1].valueGBP);
  for (const [index, entry] of [first, second].entries()) {
    const alert = alerts[index], quote = model.quote(entry);
    const history = model.history({ entries: [entry], period: '1M' });
    const previous = history.find(point => point.date === '2026-11-13').valueGBP;
    assert.equal(alert.id, 'price-' + entry.id);
    assert.equal(alert.type, 'price'); assert.equal(alert.catalogueId, entry.catalogueId);
    assert.equal(alert.valueGBP, quote.valueGBP); assert.equal(alert.previousGBP, previous);
    assert.equal(alert.changeGBP, quote.valueGBP - previous);
    assert.notEqual(alert.changeGBP, 0);
    assert.equal(alert.changePercent, quote.changeWeek);
    assert.equal(alert.year, entry.year); assert.equal(alert.set, entry.set); assert.equal(alert.condition, entry.condition);
    assert.equal(alert.source, 'sample'); assert.equal(alert.asOf, AS_OF);
    assert.match(alert.title, /sample/); assert.match(alert.body, /In-app example, not live monitoring/);
    assert.ok(alert.body.includes(quote.valueGBP + ' GBP'));
  }
  assert.deepEqual(model.alerts().filter(alert => alert.collectionId).map(alert => alert.id), alerts.map(alert => alert.id));
  assert.equal(state.portfolio.collection.length, 2);
});

test('personal weekly alerts, the digest total and its top mover agree for the exact declared piece', () => {
  const { model } = setup();
  const entry = model.add({ catalogueId: 'santos', year: 2022, set: 'watch', condition: 'Good' });
  model.toggleFollow('black-bay');
  const quote = model.quote(entry), weekly = model.digest(), alert = model.alerts().find(item => item.collectionId === entry.id);
  assert.equal(quote.changeWeek, 0.18);
  assert.notEqual(quote.changeWeek, model.find('santos').changeWeek);
  assert.equal(weekly.topMover.collectionId, entry.id);
  assert.equal(weekly.topMover.catalogueId, 'santos');
  assert.equal(weekly.topMover.year, 2022); assert.equal(weekly.topMover.set, 'watch'); assert.equal(weekly.topMover.condition, 'Good');
  assert.equal(weekly.topMover.valueGBP, quote.valueGBP);
  assert.equal(weekly.topMover.changeWeek, quote.changeWeek);
  assert.equal(weekly.topMover.changePercent, weekly.changePercent);
  assert.equal(weekly.topMover.changeGBP, weekly.changeGBP);
  assert.equal(alert.valueGBP, weekly.valueGBP);
  assert.equal(alert.changeGBP, weekly.changeGBP);
  assert.equal(alert.changePercent, weekly.changePercent);
  assert.equal(alert.previousGBP, weekly.topMover.previousGBP);
});

test('personal alert read state respects preferences, persists and is removed with its exact watch', () => {
  const { model, state } = setup();
  const first = model.add({ catalogueId: 'santos', condition: 'Good' });
  const second = model.add({ catalogueId: 'santos', condition: 'Excellent' });
  const firstId = 'price-' + first.id, secondId = 'price-' + second.id;
  assert.equal(model.markRead(firstId), true);
  assert.equal(model.markRead(firstId), true);
  assert.deepEqual(state.portfolio.readAlerts, [firstId]);
  model.preferences({ priceAlerts: false });
  assert.ok(model.alerts().every(alert => alert.type !== 'price'));
  assert.equal(model.markRead(secondId), false);
  model.preferences({ priceAlerts: true });
  assert.equal(model.alerts().find(alert => alert.id === firstId).read, true);
  assert.equal(model.alerts().find(alert => alert.id === secondId).read, false);
  const reloaded = create({ state: structuredClone(state), now: () => NOW });
  assert.equal(reloaded.alerts().find(alert => alert.id === firstId).read, true);
  assert.equal(model.remove(first.id), true);
  assert.deepEqual(state.portfolio.readAlerts, []);
  assert.equal(model.markRead(firstId), false);
  assert.ok(model.alerts().some(alert => alert.id === secondId));
  const invalid = structuredClone(state.portfolio); invalid.readAlerts = [firstId];
  assert.throws(() => validate(invalid, { now: () => NOW }), { code: 'PORTFOLIO_INVALID' });
  invalid.readAlerts = ['price-pc-999999'];
  assert.throws(() => validate(invalid, { now: () => NOW }), { code: 'PORTFOLIO_INVALID' });
});

test('read state supports the bounded maximum of collection alerts, rules, followed references and digest', () => {
  const { model, state } = setup();
  for (let index = 0; index < LIMITS.collection; index++) model.add({ catalogueId: 'santos', condition: 'Good' });
  for (let index = 0; index < LIMITS.rules; index++) model.addRule({ catalogueId: 'santos', direction: 'above', targetGBP: 1000 + index });
  for (const watch of model.catalogue()) model.toggleFollow(watch.id);
  const alerts = model.alerts();
  assert.equal(alerts.length, LIMITS.collection + LIMITS.rules + model.catalogue().length + 1);
  assert.equal(new Set(alerts.map(alert => alert.id)).size, alerts.length);
  for (const alert of alerts) assert.equal(model.markRead(alert.id), true);
  assert.equal(state.portfolio.readAlerts.length, alerts.length);
  assert.doesNotThrow(() => validate(state.portfolio, { now: () => NOW }));
  assert.ok(create({ state: structuredClone(state), now: () => NOW }).alerts().every(alert => alert.read));
  const invalid = structuredClone(state.portfolio); invalid.readAlerts.push('price-pc-999999');
  assert.throws(() => validate(invalid, { now: () => NOW }), { code: 'PORTFOLIO_LIMIT' });
});

test('purchase details are optional, cent-accurate and never inserted into older collection entries', () => {
  const { model, state } = setup();
  const legacy = model.add({ catalogueId: 'santos' });
  assert.equal(Object.hasOwn(legacy, 'purchasePriceGBP'), false);
  assert.equal(Object.hasOwn(legacy, 'purchaseDate'), false);
  const before = structuredClone(state);
  create({ state, now: () => NOW });
  assert.deepEqual(state, before);
  const zero = model.add({ catalogueId: 'santos', purchasePriceGBP: 0, purchaseDate: '1900-01' });
  const unknown = model.add({ catalogueId: 'santos', purchasePriceGBP: null, purchaseDate: '' });
  const decimal = model.add({ catalogueId: 'santos', purchasePriceGBP: 0.29, purchaseDate: '2026-11' });
  const maximum = model.add({ catalogueId: 'santos', purchasePriceGBP: 100000000 });
  assert.equal(zero.purchasePriceGBP, 0); assert.equal(zero.purchaseDate, '1900-01');
  assert.equal(unknown.purchasePriceGBP, null); assert.equal(Object.hasOwn(unknown, 'purchaseDate'), false);
  assert.equal(decimal.purchasePriceGBP, 0.29); assert.equal(maximum.purchasePriceGBP, 100000000);
  assert.doesNotThrow(() => model.quote(decimal));
  assert.doesNotThrow(() => validate(state.portfolio, { now: () => NOW }));
});

test('purchase corrections affect only the selected private item and can clear unknown details', () => {
  const { model, state } = setup();
  const first = model.add({ catalogueId: 'santos', serial: 'PRIVATE', purchasePriceGBP: 5000, purchaseDate: '2025-04' });
  const second = model.add({ catalogueId: 'santos', purchasePriceGBP: 6000 });
  model.toggleFollow('santos'); model.addRule({ catalogueId: 'santos', direction: 'above', targetGBP: 6000 });
  const before = structuredClone(state);
  const updated = model.updatePurchase(first.id, { purchasePriceGBP: 5250.75, purchaseDate: '2026-10' });
  assert.equal(updated.purchasePriceGBP, 5250.75); assert.equal(updated.purchaseDate, '2026-10');
  const expected = structuredClone(before);
  Object.assign(expected.portfolio.collection[0], { purchasePriceGBP: 5250.75, purchaseDate: '2026-10' });
  assert.deepEqual(state, expected);
  updated.purchasePriceGBP = 1;
  assert.equal(model.collection()[0].purchasePriceGBP, 5250.75);
  const cleared = model.updatePurchase(first.id, { purchasePriceGBP: null, purchaseDate: null });
  assert.equal(cleared.purchasePriceGBP, null); assert.equal(Object.hasOwn(cleared, 'purchaseDate'), false);
  assert.deepEqual(model.collection()[1], second);
  assert.throws(() => model.updatePurchase('santos', { purchasePriceGBP: 1 }), { code: 'PORTFOLIO_ENTRY' });
  assert.throws(() => model.updatePurchase('pc-999', { purchasePriceGBP: 1 }), { code: 'PORTFOLIO_ENTRY' });
});

test('invalid purchase prices and future or malformed months fail atomically', () => {
  const { model, state } = setup();
  const entry = model.add({ catalogueId: 'santos', purchasePriceGBP: 5000, purchaseDate: '2025-06' });
  const original = JSON.stringify(state);
  for (const purchasePriceGBP of [-1, -0.001, 100000000.01, NaN, Infinity, '5000', 0.001, 1.999, 0.000000000001, 1e-18]) {
    assert.throws(() => model.add({ catalogueId: 'santos', purchasePriceGBP }), { code: 'PORTFOLIO_PURCHASE_PRICE' });
    assert.throws(() => model.updatePurchase(entry.id, { purchasePriceGBP }), { code: 'PORTFOLIO_PURCHASE_PRICE' });
    assert.equal(JSON.stringify(state), original);
  }
  for (const purchaseDate of ['1899-12', '2026-12', '2027-01', '2026-00', '2026-13', '2026-1', '2026-11-01', 'tomorrow', 202611, {}]) {
    assert.throws(() => model.add({ catalogueId: 'santos', purchaseDate }), { code: 'PORTFOLIO_PURCHASE_DATE' });
    assert.throws(() => model.updatePurchase(entry.id, { purchasePriceGBP: 5500, purchaseDate }), { code: 'PORTFOLIO_PURCHASE_DATE' });
    assert.equal(JSON.stringify(state), original);
  }
  assert.throws(() => model.updatePurchase(entry.id, { catalogueId: 'submariner', purchasePriceGBP: 1 }), { code: 'PORTFOLIO_INVALID' });
  assert.throws(() => model.updatePurchase(entry.id, JSON.parse('{"__proto__":{"polluted":true}}')), { code: 'PORTFOLIO_INVALID' });
  const accessor = {};
  Object.defineProperty(accessor, 'purchasePriceGBP', { enumerable: true, get: () => assert.fail('A purchase accessor must not execute') });
  assert.throws(() => model.updatePurchase(entry.id, accessor), { code: 'PORTFOLIO_INVALID' });
  assert.equal(JSON.stringify(state), original);
  assert.equal({}.polluted, undefined);
});

test('restored purchase fields use the same validation and do not allow a future month', () => {
  const { model, state } = setup();
  model.add({ catalogueId: 'santos' });
  for (const fields of [{ purchasePriceGBP: '5000' }, { purchasePriceGBP: 1.001 }, { purchaseDate: '2026-12' }, { purchaseDate: null }, { purchasePriceGBP: undefined }]) {
    const candidate = structuredClone(state);
    Object.assign(candidate.portfolio.collection[0], fields);
    const original = structuredClone(candidate);
    assert.throws(() => create({ state: candidate, now: () => NOW }));
    assert.deepEqual(candidate, original);
  }
  const later = create({ state: {}, now: () => Date.parse('2028-02-01T00:00:00Z') });
  assert.equal(later.add({ catalogueId: 'santos', purchaseDate: '2028-02' }).purchaseDate, '2028-02');
  assert.throws(() => later.add({ catalogueId: 'santos', purchaseDate: '2028-03' }), { code: 'PORTFOLIO_PURCHASE_DATE' });
});
