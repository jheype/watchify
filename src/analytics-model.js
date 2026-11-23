/* Deterministic analytics over private holdings and the dated Watchify sample basket. */
(function attachAnalyticsModel(root) {
  'use strict';

  const PERIODS = new Set(['1M', '6M', '1Y', 'All']);
  const DAY = 86400000;
  const TRADING = Object.freeze({
    submariner: [18, 128, 0.06, 0.2], santos: [26, 74, -0.04, 1.1], datejust: [24, 106, 0.03, 2.0],
    speedmaster: [36, 88, 0.08, 2.8], 'black-bay': [32, 69, 0.05, 3.6], 'gmt-pepsi': [15, 81, -0.06, 4.5],
    'cartier-tank': [29, 57, 0.04, 5.3], 'royal-oak': [49, 42, -0.03, 6.0]
  });
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const percent = (value, previous) => previous > 0 ? (value / previous - 1) * 100 : null;
  const roundPercent = value => Math.round(value * 100) / 100;
  const cents = value => Math.round(value * 100);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

  function options(value, allowed) {
    if (!plain(value)) fail('ANALYTICS_INVALID', 'Analytics options must be a data object.');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) fail('ANALYTICS_INVALID', 'An analytics option is not supported.');
    }
  }

  function period(value = '6M') {
    if (!PERIODS.has(value)) fail('ANALYTICS_PERIOD', 'Choose 1M, 6M, 1Y or All.');
    return value;
  }

  function series(points) {
    if (!Array.isArray(points) || !points.length || points.length > 1000) fail('ANALYTICS_DATA', 'The sample history is unavailable.');
    let previous = '';
    for (const point of points) {
      if (!plain(point) || typeof point.date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(point.date) || !Number.isFinite(Date.parse(point.date)) || point.date <= previous || !Number.isFinite(point.valueGBP) || point.valueGBP < 0) fail('ANALYTICS_DATA', 'The sample history contains an invalid point.');
      previous = point.date;
    }
    return points;
  }

  function align(histories) {
    if (!histories.length) fail('ANALYTICS_DATA', 'The sample index has no constituents.');
    const first = histories[0];
    if (histories.some(points => points.length !== first.length || points.some((point, index) => point.date !== first[index].date))) fail('ANALYTICS_DATA', 'Sample histories must use the same dates.');
  }

  function create({ model } = {}) {
    if (!model || ['catalogue', 'collection', 'quote', 'history', 'summary'].some(key => typeof model[key] !== 'function')) fail('ANALYTICS_INVALID', 'The Watchify portfolio model is required.');
    const catalogue = model.catalogue();
    if (!Array.isArray(catalogue) || !catalogue.length || catalogue.length > 100 || new Set(catalogue.map(watch => watch.id)).size !== catalogue.length) fail('ANALYTICS_DATA', 'The sample catalogue is invalid.');
    const asOf = catalogue[0].asOf;
    if (typeof asOf !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(asOf) || catalogue.some(watch => watch.source !== 'sample' || watch.currency !== 'GBP' || watch.asOf !== asOf || typeof watch.id !== 'string' || !Number.isFinite(watch.valueGBP) || watch.valueGBP <= 0)) fail('ANALYTICS_DATA', 'Analytics requires the dated GBP sample catalogue.');
    const byId = new Map(catalogue.map(watch => [watch.id, watch]));
    const brands = new Set(catalogue.map(watch => watch.brand));
    const provenance = () => ({ source: 'sample', asOf, currency: 'GBP' });
    const reference = id => {
      if (typeof id !== 'string' || !byId.has(id)) fail('ANALYTICS_REFERENCE', 'Choose a supported watch reference.');
      return byId.get(id);
    };
    const brandName = value => {
      if (value === undefined || value === 'all') return 'all';
      if (typeof value !== 'string' || !brands.has(value)) fail('ANALYTICS_BRAND', 'Choose a supported watch brand.');
      return value;
    };
    const historyCache = new Map();
    const history = (id, selectedPeriod) => {
      const key = id + ':' + selectedPeriod;
      if (!historyCache.has(key)) historyCache.set(key, copy(series(model.history({ catalogueId: id, period: selectedPeriod }))));
      return historyCache.get(key);
    };
    const baseDate = history(catalogue[0].id, 'All')[0].date;
    if (catalogue.some(watch => history(watch.id, 'All')[0].date !== baseDate || history(watch.id, 'All').at(-1).date !== asOf)) fail('ANALYTICS_DATA', 'Sample indices require a common historical origin.');

    function index(input = {}) {
      options(input, ['brand', 'period']);
      const selectedPeriod = period(input.period), brand = brandName(input.brand);
      const members = catalogue.filter(watch => brand === 'all' || watch.brand === brand);
      const histories = members.map(watch => history(watch.id, selectedPeriod));
      align(histories);
      const originValues = members.map(watch => history(watch.id, 'All')[0].valueGBP);
      const originTotal = originValues.reduce((sum, value) => sum + value, 0);
      const periodTotal = histories.reduce((sum, points) => sum + points[0].valueGBP, 0);
      const currentTotal = histories.reduce((sum, points) => sum + points.at(-1).valueGBP, 0);
      if (originTotal <= 0 || periodTotal <= 0 || currentTotal <= 0) fail('ANALYTICS_DATA', 'The sample index needs positive reference prices.');
      const points = histories[0].map((point, pointIndex) => ({ date: point.date, value: histories.reduce((sum, prices) => sum + prices[pointIndex].valueGBP, 0) / originTotal * 100 }));
      const constituents = members.map((watch, memberIndex) => {
        const start = histories[memberIndex][0].valueGBP, end = histories[memberIndex].at(-1).valueGBP;
        return {
          id: watch.id, catalogueId: watch.id, brand: watch.brand, model: watch.model, reference: watch.reference, image: watch.image,
          valueGBP: end, weightPercent: originValues[memberIndex] / originTotal * 100,
          periodWeightPercent: start / periodTotal * 100, currentWeightPercent: end / currentTotal * 100,
          changePercent: percent(end, start), contributionPercent: (end - start) / periodTotal * 100,
          ...provenance()
        };
      });
      return {
        brand, name: brand === 'all' ? 'Watchify Sample Index' : brand + ' Sample Index', period: selectedPeriod,
        value: points.at(-1).value, changePercent: percent(currentTotal, periodTotal), changePoints: points.at(-1).value - points[0].value,
        points, constituents, baseDate, constituentCount: members.length,
        methodology: 'One fixed unit of each eligible reference. Value weights at the common origin determine the base-100 basket; period-start value weights determine return contributions. Sample prices only.',
        ...provenance()
      };
    }

    function collection(input = {}) {
      options(input, ['period']);
      const selectedPeriod = period(input.period), entries = model.collection();
      const summary = model.summary(entries, selectedPeriod);
      const valued = entries.map(entry => ({ entry, quote: model.quote(entry) }));
      const known = valued.filter(item => item.entry.purchasePriceGBP !== undefined && item.entry.purchasePriceGBP !== null);
      const costCents = known.reduce((sum, item) => sum + cents(item.entry.purchasePriceGBP), 0);
      const valueCents = known.reduce((sum, item) => sum + cents(item.quote.valueGBP), 0);
      const gain = { knownCount: known.length, totalCount: entries.length, costGBP: costCents / 100, valueGBP: valueCents / 100, gainGBP: (valueCents - costCents) / 100, gainPercent: costCents > 0 ? percent(valueCents, costCents) : null };
      const performanceItem = ({ entry, quote }) => ({
        entryId: entry.id, catalogueId: entry.catalogueId, brand: quote.brand, model: quote.model, reference: quote.reference,
        image: entry.image || quote.image, year: entry.year, set: entry.set, condition: entry.condition,
        ...(entry.purchaseDate ? { purchaseDate: entry.purchaseDate } : {}),
        costGBP: entry.purchasePriceGBP, valueGBP: quote.valueGBP,
        gainGBP: (cents(quote.valueGBP) - cents(entry.purchasePriceGBP)) / 100,
        gainPercent: entry.purchasePriceGBP > 0 ? percent(quote.valueGBP, entry.purchasePriceGBP) : null,
        ...provenance()
      });
      const ranked = known.filter(item => item.entry.purchasePriceGBP > 0).map(performanceItem).sort((a, b) => b.gainPercent - a.gainPercent || b.gainGBP - a.gainGBP || a.entryId.localeCompare(b.entryId));
      const performance = { best: ranked.slice(0, 3), worst: ranked.slice().sort((a, b) => a.gainPercent - b.gainPercent || a.gainGBP - b.gainGBP || a.entryId.localeCompare(b.entryId)).slice(0, 3), unranked: known.filter(item => item.entry.purchasePriceGBP === 0).map(performanceItem) };
      const groups = new Map();
      for (const item of valued) {
        if (!groups.has(item.quote.brand)) groups.set(item.quote.brand, []);
        groups.get(item.quote.brand).push(item.entry);
      }
      const allocation = [...groups].map(([brand, items]) => {
        const totals = model.summary(items, selectedPeriod);
        return { brand, count: items.length, valueGBP: totals.valueGBP, sharePercent: summary.valueGBP > 0 ? totals.valueGBP / summary.valueGBP * 100 : 0, changeGBP: totals.changeGBP, changePercent: totals.changePercent, entries: items.map(entry => entry.id), ...provenance() };
      }).sort((a, b) => b.valueGBP - a.valueGBP || a.brand.localeCompare(b.brand));
      const holdings = series(model.history({ entries, period: selectedPeriod }));
      const market = index({ period: selectedPeriod });
      if (holdings.length !== market.points.length || holdings.some((point, position) => point.date !== market.points[position].date)) fail('ANALYTICS_DATA', 'The collection and benchmark dates do not match.');
      const initialCollection = holdings[0].valueGBP, initialMarket = market.points[0].value;
      const benchmark = holdings.map((point, position) => ({ date: point.date, collectionIndex: entries.length && initialCollection > 0 ? point.valueGBP / initialCollection * 100 : null, marketIndex: market.points[position].value / initialMarket * 100 }));
      return {
        period: selectedPeriod, summary, gain, performance, allocation, benchmark,
        methodology: 'Gain compares current sample estimates with user-entered purchase prices, only where cost is known. The benchmark backcasts current holdings and the same sample market basket; it is not an actual account return history.',
        ...provenance()
      };
    }

    function marketMovers(input = {}) {
      options(input, ['period', 'direction', 'brand']);
      const selectedPeriod = input.period === undefined ? 'week' : input.period;
      if (!['week', 'month', 'year'].includes(selectedPeriod)) fail('ANALYTICS_PERIOD', 'Choose week, month or year for market movers.');
      const direction = input.direction === undefined ? 'rising' : input.direction;
      if (!['rising', 'falling'].includes(direction)) fail('ANALYTICS_DIRECTION', 'Choose rising or falling sample prices.');
      const brand = brandName(input.brand);
      const weekStart = new Date(Date.parse(asOf + 'T00:00:00.000Z') - 7 * DAY).toISOString().slice(0, 10);
      const items = catalogue.filter(watch => brand === 'all' || watch.brand === brand).map(watch => {
        const points = history(watch.id, selectedPeriod === 'year' ? '1Y' : '1M');
        const previousGBP = selectedPeriod === 'week' ? points.find(point => point.date === weekStart)?.valueGBP : points[0].valueGBP;
        if (!Number.isFinite(previousGBP) || previousGBP <= 0) fail('ANALYTICS_DATA', 'The sample movement period is unavailable.');
        const valueGBP = points.at(-1).valueGBP;
        return { ...copy(watch), valueGBP, previousGBP, changeGBP: valueGBP - previousGBP, changePercent: roundPercent(percent(valueGBP, previousGBP)), ...provenance() };
      }).filter(item => direction === 'rising' ? item.changeGBP > 0 : item.changeGBP < 0).sort((a, b) => (direction === 'rising' ? b.changePercent - a.changePercent : a.changePercent - b.changePercent) || a.id.localeCompare(b.id)).slice(0, 10);
      return { items, period: selectedPeriod, direction, brand, ...provenance() };
    }

    function trading(catalogueId, input = {}) {
      options(input, ['period']);
      const selectedPeriod = period(input.period), watch = reference(catalogueId);
      if (!Object.hasOwn(TRADING, watch.id)) fail('ANALYTICS_DATA', 'This reference has no illustrative trading dataset.');
      const [medianDays, supply, trend, phase] = TRADING[watch.id];
      const anchor = Date.parse(asOf + 'T00:00:00.000Z');
      const countAt = date => {
        const days = (Date.parse(date + 'T00:00:00.000Z') - anchor) / DAY;
        const wave = supply * 0.08 * (Math.sin(days / 37 + phase) - Math.sin(phase));
        return Math.max(1, Math.round(supply * (1 + trend * days / 365) + wave));
      };
      const points = history(watch.id, selectedPeriod).map(point => ({ date: point.date, numberListed: countAt(point.date) }));
      const priorDate = new Date(anchor - 30 * DAY).toISOString().slice(0, 10), previous = countAt(priorDate);
      return {
        catalogueId, watch: copy(watch), period: selectedPeriod, medianDays,
        liquidityLabel: medianDays <= 21 ? 'Fast' : medianDays <= 45 ? 'Average' : 'Slow',
        supply, supplyChange30d: supply - previous, supplyChange30dPercent: percent(supply, previous), points,
        methodology: 'Fixed illustrative liquidity and listed-count data, not observed sales or listings. Fast means up to 21 sample days, Average 22–45, and Slow above 45. No live feed or daily refresh is connected.',
        ...provenance()
      };
    }

    return Object.freeze({ collection, index, marketMovers, trading });
  }

  const api = Object.freeze({ create });
  root.WatchifyAnalyticsModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
