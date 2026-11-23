'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { create: createPortfolio } = require('../src/portfolio-model.js');
const views = require('../src/analytics-views.js');

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const copy = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

function context(overrides = {}) {
  const state = { currency: 'GBP' };
  const model = createPortfolio({ state, now: () => NOW });
  const ctx = {
    state, model, analytics: null,
    ui: { period: '6M', analyticsTab: 'portfolio', analyticsBrand: 'all', analyticsIndex: 'all', analyticsWatch: 'submariner' },
    money: value => 'GBP ' + value.toLocaleString('en-GB'), esc,
    icon: name => `<svg class="icon" aria-hidden="true" data-icon="${esc(name)}"></svg>`,
    change: value => `<span class="change">${value > 0 ? '+' : ''}${value}%</span>`,
    watchCell: (watch, entry, options = {}) => `<a href="#${entry ? 'collection/' + encodeURIComponent(entry.id) : 'watch/' + encodeURIComponent(watch.id)}">${esc(watch.brand + ' ' + watch.model + ' ' + watch.reference)}${options.owned ? ' In your collection' : ''}</a>`,
    pageHeading: (kicker, heading, description) => `<header><p>${esc(kicker)}</p><h1>${esc(heading)}</h1><p>${esc(description)}</p></header>`,
    footer: () => '<footer>Watchify</footer>',
    empty: (heading, description, actions = '') => `<h2>${esc(heading)}</h2><p>${esc(description)}</p>${actions}`,
    dateLabel: value => value,
    periodControls: () => '<div data-test="period-controls">1M · 6M · 1Y · All</div>',
    ...overrides
  };
  return ctx;
}

function sampleIndex(model, { brand = 'all', period = '6M' } = {}) {
  const references = model.catalogue().filter(watch => brand === 'all' || watch.brand === brand);
  return {
    brand, name: brand === 'all' ? 'Watch market index' : brand + ' index', value: 112.4, changePercent: 1.9, changePoints: 2.1,
    points: [{ date: '2026-05-21', value: 110.3 }, { date: '2026-11-20', value: 112.4 }],
    constituents: references.map(watch => ({ ...watch, catalogueId: watch.id, weightPercent: 100 / references.length, changePercent: 1.9, contributionPercent: 1.9 / references.length })),
    baseDate: '2024-11-20', asOf: '2026-11-20', source: 'sample', period
  };
}

function sampleCollection(ctx, overrides = {}) {
  const entries = ctx.model.collection(), summary = ctx.model.summary(entries, ctx.ui.period);
  return {
    summary,
    gain: { knownCount: 0, totalCount: entries.length, costGBP: 0, valueGBP: 0, gainGBP: 0, gainPercent: null },
    performance: { best: [], worst: [], unranked: [] },
    allocation: [],
    benchmark: [{ date: '2026-05-21', collectionIndex: 100, marketIndex: 100 }, { date: '2026-11-20', collectionIndex: 103.4, marketIndex: 101.9 }],
    asOf: '2026-11-20', currency: 'GBP', source: 'sample', ...overrides
  };
}

test('an empty Analytics portfolio never renders or stores an example holding', () => {
  const ctx = context();
  ctx.analytics = { collection() { throw new Error('An empty page must not invent a portfolio series.'); } };
  const before = copy(ctx.state);
  const html = views.page(ctx);
  assert.match(html, /Add your first watch/);
  assert.match(html, /Market indices/); assert.match(html, /Trading/);
  assert.doesNotMatch(html, /an-headline-number|data-pf-action="valuation-report"|#collection\/|an-chart-line/);
  assert.deepEqual(ctx.state, before);
});

test('rendering uses supplied analytics, shows partial cost coverage and keeps performance links personal', () => {
  const ctx = context();
  const owned = ctx.model.add({ catalogueId: 'submariner', purchasePriceGBP: 8500 });
  ctx.model.add({ catalogueId: 'santos' });
  const row = { ...ctx.model.find('submariner'), entryId: owned.id, gainGBP: 2300, gainPercent: 27.06 };
  const data = freeze(sampleCollection(ctx, {
    gain: { knownCount: 1, totalCount: 2, costGBP: 8500, valueGBP: 10800, gainGBP: 2300, gainPercent: 27.06 },
    performance: { best: [row], worst: [row], unranked: [] }
  }));
  ctx.analytics = { collection: args => { assert.deepEqual(args, { period: '6M' }); return data; }, index: args => sampleIndex(ctx.model, args) };
  const before = copy(ctx.state), beforeUI = copy(ctx.ui);
  freeze(ctx.state); freeze(ctx.ui);
  const html = views.page(ctx);
  assert.match(html, /1 of 2 watches with a recorded purchase price/);
  assert.match(html, /Partial coverage/);
  assert.match(html, /GBP 2,300/); assert.match(html, /27\.06%/);
  assert.match(html, new RegExp('#collection/' + owned.id));
  assert.match(html, /No cost|recorded cost/);
  assert.match(html, /data-pf-action="valuation-report"/);
  assert.equal((html.match(/<svg[^>]*role="img"/g) || []).length, 2, 'one trend chart and one allocation ring');
  assert.doesNotMatch(html, /\bstyle=|\bonclick=|NaN|Infinity|undefined/);
  assert.deepEqual(ctx.state, before); assert.deepEqual(ctx.ui, beforeUI);
});

test('a known zero purchase price is retained without an invented percentage or division by zero', () => {
  const ctx = context(); ctx.model.add({ catalogueId: 'santos', purchasePriceGBP: 0 });
  ctx.analytics = {
    collection: () => sampleCollection(ctx, { gain: { knownCount: 1, totalCount: 1, costGBP: 0, valueGBP: 6350, gainGBP: 6350, gainPercent: null }, performance: { best: [], worst: [], unranked: [{}] } }),
    index: args => sampleIndex(ctx.model, args)
  };
  const html = views.page(ctx);
  assert.match(html, /1 of 1 watch with a recorded purchase price/);
  assert.match(html, /percentage is unavailable because the recorded cost is zero/);
  assert.match(html, /GBP 6,350/);
  assert.doesNotMatch(html, /NaN|Infinity|null%/);
});

test('purchase costs and gains retain pennies through the exact-money formatter', () => {
  const { create: createAnalytics } = require('../src/analytics-model.js');
  const exact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ctx = context({ moneyExact: value => exact.format(value) });
  ctx.model.add({ catalogueId: 'santos', purchasePriceGBP: 0.29 });
  ctx.analytics = createAnalytics({ model: ctx.model });
  const html = views.page(ctx);
  assert.match(html, /£0\.29 recorded cost/);
  assert.match(html, /£6,349\.71/);
  assert.doesNotMatch(html, /£0(?:\.00)? recorded cost/);
  assert.match(html, /1 of 1 watch with a recorded purchase price/);
});

test('brand drilldown renders only selected owned entries and uses the existing purchase action contract', () => {
  const ctx = context();
  const rolex = ctx.model.add({ catalogueId: 'submariner', purchasePriceGBP: 0 });
  const cartier = ctx.model.add({ catalogueId: 'santos' });
  ctx.ui.analyticsBrand = 'Rolex';
  ctx.analytics = {
    collection: () => sampleCollection(ctx, { allocation: [{ brand: 'Rolex', count: 1, valueGBP: 10800, sharePercent: 62.97, changePercent: 7.5, entries: [rolex.id] }, { brand: 'Cartier', count: 1, valueGBP: 6350, sharePercent: 37.03, changePercent: 4.2, entries: [cartier.id] }] }),
    index: args => sampleIndex(ctx.model, args)
  };
  const html = views.page(ctx);
  const detail = html.slice(html.indexOf('<section class="an-allocation-detail"'), html.indexOf('<section class="pf-panel an-report"'));
  assert.match(detail, new RegExp('#collection/' + rolex.id));
  assert.doesNotMatch(detail, new RegExp('#collection/' + cartier.id));
  assert.match(detail, /Edit purchase details/);
  assert.match(detail, new RegExp('data-pf-action="purchase-info" data-id="' + rolex.id + '"'));
  assert.match(html, /stroke-dasharray=/); assert.doesNotMatch(html, /style=/);
});

test('market indices show the fixed origin and catalogue links without inventing ownership', () => {
  const ctx = context(); ctx.ui.analyticsTab = 'indices'; ctx.ui.analyticsIndex = 'Rolex';
  ctx.analytics = { index: args => sampleIndex(ctx.model, args) };
  const html = views.page(ctx);
  assert.match(html, /Index = 100 on 2024-11-20/);
  assert.match(html, /changing the view period does not reset its origin/);
  assert.match(html, /data-pf-action="analytics-index" data-value="Rolex" aria-pressed="true"/);
  assert.match(html, /#watch\/submariner/);
  assert.doesNotMatch(html, /#collection\/|In your collection/);
  assert.equal((html.match(/<svg[^>]*role="img"/g) || []).length, 1);
});

test('trading uses supplied liquidity and absolute/percent supply change, dated and explicit about sample data', () => {
  const ctx = context(); ctx.ui.analyticsTab = 'trading';
  ctx.analytics = { trading(id, options) {
    assert.equal(id, 'submariner'); assert.deepEqual(options, { period: '6M' });
    return { catalogueId: id, watch: ctx.model.find(id), medianDays: 9, liquidityLabel: 'Fast', supply: 42, supplyChange30d: -6, supplyChange30dPercent: -12.5, points: [{ date: '2026-05-21', numberListed: 60 }, { date: '2026-11-20', numberListed: 42 }], asOf: '2026-11-20', source: 'sample' };
  } };
  const html = views.page(ctx);
  assert.match(html, /9<span class="an-value-unit"> days/);
  assert.match(html, /42<\/div>/); assert.match(html, /-12\.5%/);
  assert.match(html, /6 fewer listings/); assert.match(html, /90-day median/);
  assert.match(html, /no live listing feed is connected/);
  assert.match(html, /id="pf-analytics-watch"/);
  assert.equal((html.match(/<svg[^>]*role="img"/g) || []).length, 1);
});

test('dynamic model labels are escaped and chart output remains pure HTML without active attributes', () => {
  const ctx = context(); ctx.ui.analyticsTab = 'indices';
  ctx.analytics = { index: args => ({ ...sampleIndex(ctx.model, args), name: '\"><img src=x onerror=alert(1)>' }) };
  const html = views.page(ctx);
  assert.doesNotMatch(html, /<img src=x|<script|<[a-z][^>]*\s(?:onerror|onclick|style)\s*=/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.throws(() => views.chartSVG(ctx, { id: 'test', title: 'Invalid', series: [{ label: 'Sample', points: [{ date: '2026-11-20', value: Infinity }] }], caption: 'Invalid series' }), /invalid value/);
});

test('all three views consume the real analytics model for each period without changing the workspace', () => {
  const { create: createAnalytics } = require('../src/analytics-model.js');
  const ctx = context();
  const owned = ctx.model.add({ catalogueId: 'submariner', year: 2020, set: 'papers', condition: 'Good', purchasePriceGBP: 8500, purchaseDate: '2021-03' });
  ctx.model.add({ catalogueId: 'santos', purchasePriceGBP: 0 });
  ctx.model.add({ catalogueId: 'speedmaster' });
  ctx.analytics = createAnalytics({ model: ctx.model });
  const before = copy(ctx.state);
  freeze(ctx.state);
  for (const period of ['1M', '6M', '1Y', 'All']) {
    for (const tab of ['portfolio', 'indices', 'trading']) {
      ctx.ui = { ...ctx.ui, period, analyticsTab: tab, analyticsBrand: 'Rolex', analyticsIndex: 'Rolex' };
      const html = views.page(ctx);
      assert.match(html, /<h1>Analytics\.<\/h1>/);
      assert.doesNotMatch(html, /NaN|Infinity|undefined|\bstyle=|\bonclick=/);
      assert.match(html, /2026-11-20/);
      assert.match(html, /View chart data/);
      if (tab === 'portfolio') {
        assert.match(html, /2 of 3 watches with a recorded purchase price/);
        assert.match(html, /Partial coverage/);
        assert.match(html, new RegExp('#collection/' + owned.id));
        assert.match(html, /Both lines start at 100/);
      }
    }
  }
  assert.deepEqual(ctx.state, before);
});
