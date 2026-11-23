/* Private portfolio records and deterministic sample prices. No live feed or commerce. */
(function attachPortfolioModel(root) {
  'use strict';

  const VERSION = 1;
  const AS_OF = '2026-11-20';
  const DAY = 86400000;
  const ANCHOR = Date.parse(AS_OF + 'T00:00:00.000Z');
  const LIMITS = Object.freeze({ collection: 100, rules: 100, serial: 120, serviceHistory: 2000, image: 8 * 1024 * 1024, targetMin: 100, targetMax: 1000000 });
  const PERIODS = Object.freeze({ '1M': 30, '6M': 183, '1Y': 365, All: 730 });
  const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const MEDIA_REF = /^watchify-media:m[1-9][0-9]*$/;
  const ENTRY_KEYS = ['id', 'catalogueId', 'year', 'set', 'condition', 'image', 'serial', 'serviceHistory', 'addedAt'];
  const PURCHASE_KEYS = ['purchasePriceGBP', 'purchaseDate'];
  const QUOTE_KEYS = [...ENTRY_KEYS, ...PURCHASE_KEYS];
  const CATALOGUE = Object.freeze([
    ['submariner', 'Rolex', 'Submariner Date', '126610LN', 2023, 'assets/submariner-front.webp', 10800, 0.075, 0.009, 0.1],
    ['santos', 'Cartier', 'Santos de Cartier', 'WSSA0010', 2018, 'assets/santos.webp', 6350, 0.042, 0.008, 1.1],
    ['datejust', 'Rolex', 'Datejust 41', '126334', 2024, 'assets/datejust.webp', 11600, 0.058, 0.012, 2.0],
    ['speedmaster', 'Omega', 'Speedmaster Moonwatch', '310.30.42.50.01.002', 2022, 'assets/speedmaster.webp', 5650, -0.025, 0.007, 2.8],
    ['black-bay', 'Tudor', 'Black Bay Fifty-Eight', '79030N', 2021, 'assets/black-bay.webp', 3100, -0.018, 0.011, 3.6],
    ['gmt-pepsi', 'Rolex', 'GMT-Master II “Pepsi”', '126710BLRO', 2023, 'assets/gmt-front.webp', 16900, 0.095, 0.013, 4.5],
    ['cartier-tank', 'Cartier', 'Tank Must', 'WSTA0041', 2024, 'assets/cartier-tank.webp', 3150, 0.036, 0.008, 5.3],
    ['royal-oak', 'Audemars Piguet', 'Royal Oak', '15400ST.OO.1220ST.03', 2012, 'assets/royal-oak.webp', 29800, -0.052, 0.014, 6.0]
  ].map(([id, brand, model, reference, year, image, marketPrice, trend, amplitude, phase]) => Object.freeze({ id, brand, model, reference, year, image, marketPrice, trend, amplitude, phase })));
  const BY_ID = new Map(CATALOGUE.map(watch => [watch.id, watch]));
  const ASSET_IMAGES = new Set(CATALOGUE.map(watch => watch.image));
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const amount = value => Math.round(value);
  const percent = (current, previous) => previous === 0 ? 0 : Math.round((current - previous) / previous * 10000) / 100;
  const stamp = timestamp => new Date(timestamp).toISOString();

  function object(value, allowed, required = allowed) {
    if (!plain(value)) fail('PORTFOLIO_INVALID', 'A portfolio record is invalid.');
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || UNSAFE_KEYS.has(key) || !allowed.includes(key))) fail('PORTFOLIO_INVALID', 'A portfolio record contains an unsupported field.');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) fail('PORTFOLIO_INVALID', 'Portfolio records must contain data only.');
    }
    if (required.some(key => !Object.hasOwn(value, key))) fail('PORTFOLIO_INVALID', 'A portfolio record is incomplete.');
  }

  function list(value, max) {
    if (!Array.isArray(value) || value.length > max) fail('PORTFOLIO_LIMIT', 'This portfolio contains too many records or an invalid list.');
    if (Reflect.ownKeys(value).length !== value.length + 1) fail('PORTFOLIO_INVALID', 'A portfolio list contains an unsupported field.');
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('PORTFOLIO_INVALID', 'Portfolio lists must contain data only.');
    }
  }

  function text(value, max, field) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(value)) fail('PORTFOLIO_INVALID', 'Check the ' + field + ' field.');
    return value;
  }

  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || stamp(Date.parse(value)) !== value) fail('PORTFOLIO_INVALID', 'A portfolio date is invalid.');
  }

  function time(now) {
    const value = typeof now === 'function' ? now() : now;
    if (!Number.isFinite(value) || value < 0 || value > Date.parse('2200-01-01T00:00:00.000Z')) fail('PORTFOLIO_INVALID', 'The portfolio clock is invalid.');
    return value;
  }

  function reference(id) {
    if (typeof id !== 'string' || !BY_ID.has(id)) fail('PORTFOLIO_REFERENCE', 'Choose a supported watch reference.');
    return BY_ID.get(id);
  }

  function image(value, mediaReferences) {
    if (typeof value !== 'string' || value.length > LIMITS.image || (value !== '' && !ASSET_IMAGES.has(value) && !(DATA_IMAGE.test(value) && (value.length - value.indexOf(',') - 1) % 4 === 0) && !(mediaReferences && MEDIA_REF.test(value)))) fail('PORTFOLIO_IMAGE', 'Use a local catalogue image or a JPG, PNG or WebP photo.');
  }

  function purchasePrice(value) {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) fail('PORTFOLIO_PURCHASE_PRICE', 'Enter a purchase price from 0 to 100,000,000 GBP, with at most two decimal places.');
    const scaled = value * 100, cents = Math.round(scaled);
    if (value !== cents / 100) fail('PORTFOLIO_PURCHASE_PRICE', 'Use at most two decimal places for the purchase price.');
    return cents / 100;
  }

  function purchaseMonth(value, latestMonth) {
    if (typeof value !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) || value < '1900-01' || value > latestMonth) fail('PORTFOLIO_PURCHASE_DATE', 'Enter a purchase month from January 1900 through the current month.');
    return value;
  }

  function choice(input, latestMonth, mediaReferences = false) {
    object(input, QUOTE_KEYS, ['catalogueId']);
    const maxYear = Number(latestMonth.slice(0, 4));
    const watch = reference(input.catalogueId);
    const year = input.year === undefined ? watch.year : input.year;
    const set = input.set === undefined ? 'full' : input.set;
    const condition = input.condition === undefined ? 'Excellent' : input.condition;
    if (!Number.isInteger(year) || year < 1900 || year > maxYear) fail('PORTFOLIO_YEAR', 'Enter a year between 1900 and ' + maxYear + '.');
    if (!['full', 'papers', 'watch'].includes(set) || !['Unworn', 'Excellent', 'Good'].includes(condition)) fail('PORTFOLIO_CONDITION', 'Choose the set and condition of your watch.');
    if (input.image !== undefined) image(input.image, mediaReferences);
    if (input.serial !== undefined) text(input.serial, LIMITS.serial, 'serial');
    if (input.serviceHistory !== undefined) text(input.serviceHistory, LIMITS.serviceHistory, 'service history');
    if (input.addedAt !== undefined) date(input.addedAt);
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^pc-[1-9][0-9]{0,8}$/.test(input.id))) fail('PORTFOLIO_INVALID', 'A collection identifier is invalid.');
    if (Object.hasOwn(input, 'purchasePriceGBP')) purchasePrice(input.purchasePriceGBP);
    if (Object.hasOwn(input, 'purchaseDate')) purchaseMonth(input.purchaseDate, latestMonth);
    return { watch, year, set, condition };
  }

  function validate(portfolio, { mediaReferences = false, now = Date.now } = {}) {
    object(portfolio, ['version', 'collection', 'following', 'rules', 'readAlerts', 'preferences', 'nextId']);
    if (portfolio.version !== VERSION) fail('PORTFOLIO_VERSION', 'This portfolio uses an unsupported version. It has not been overwritten.');
    const latestMonth = stamp(time(now)).slice(0, 7);
    list(portfolio.collection, LIMITS.collection); list(portfolio.following, CATALOGUE.length); list(portfolio.rules, LIMITS.rules); list(portfolio.readAlerts, LIMITS.collection + LIMITS.rules + CATALOGUE.length + 1);
    object(portfolio.preferences, ['weeklyDigest', 'priceAlerts']);
    if (Object.values(portfolio.preferences).some(value => typeof value !== 'boolean')) fail('PORTFOLIO_INVALID', 'Portfolio preferences must be on or off.');
    if (!Number.isSafeInteger(portfolio.nextId) || portfolio.nextId < 1 || portfolio.nextId > 1000000000) fail('PORTFOLIO_INVALID', 'The portfolio record counter is invalid.');
    const ids = new Set(), collectionIds = new Set(), ruleIds = new Set(), following = new Set();
    let highest = 0;
    for (const entry of portfolio.collection) {
      object(entry, QUOTE_KEYS, ENTRY_KEYS);
      if (ENTRY_KEYS.some(key => entry[key] === undefined)) fail('PORTFOLIO_INVALID', 'A saved collection record is incomplete.');
      choice(entry, latestMonth, mediaReferences);
      if (ids.has(entry.id)) fail('PORTFOLIO_INVALID', 'A portfolio record identifier is duplicated.');
      ids.add(entry.id); collectionIds.add(entry.id); highest = Math.max(highest, Number(entry.id.slice(3)));
    }
    for (const id of portfolio.following) {
      reference(id);
      if (following.has(id)) fail('PORTFOLIO_INVALID', 'A followed reference is duplicated.');
      following.add(id);
    }
    for (const rule of portfolio.rules) {
      object(rule, ['id', 'catalogueId', 'direction', 'targetGBP', 'createdAt']);
      if (typeof rule.id !== 'string' || !/^pr-[1-9][0-9]{0,8}$/.test(rule.id) || ids.has(rule.id)) fail('PORTFOLIO_INVALID', 'A price-alert identifier is invalid.');
      reference(rule.catalogueId); threshold(rule); date(rule.createdAt);
      ids.add(rule.id); ruleIds.add(rule.id); highest = Math.max(highest, Number(rule.id.slice(3)));
    }
    if (portfolio.nextId <= highest) fail('PORTFOLIO_INVALID', 'The portfolio record counter would reuse an identifier.');
    const read = new Set();
    for (const id of portfolio.readAlerts) {
      if (typeof id !== 'string' || read.has(id) || !(id === 'digest-' + AS_OF || (id.startsWith('price-') && (ruleIds.has(id.slice(6)) || collectionIds.has(id.slice(6)))) || (id.startsWith('market-') && following.has(id.slice(7))))) fail('PORTFOLIO_INVALID', 'A saved alert identifier is invalid.');
      read.add(id);
    }
    return portfolio;
  }

  function threshold(rule) {
    if (!['above', 'below'].includes(rule.direction) || !Number.isInteger(rule.targetGBP) || rule.targetGBP < LIMITS.targetMin || rule.targetGBP > LIMITS.targetMax) fail('PORTFOLIO_TARGET', 'Choose above or below and a whole-pound target from 100 to 1,000,000 GBP.');
  }

  // Each date has one deterministic value, shared by charts, changes and alerts.
  function baseline(watch, daysAgo) {
    const t = -daysAgo;
    const wave = watch.amplitude * (Math.sin(t / 43 + watch.phase) - Math.sin(watch.phase));
    const slow = watch.amplitude * 0.45 * (Math.sin(t / 131 + watch.phase * 0.7) - Math.sin(watch.phase * 0.7));
    return watch.marketPrice * Math.exp(watch.trend * t / 365 + wave + slow);
  }

  function factor(selected) {
    const yearRate = Math.max(-0.12, Math.min(0.04, (selected.year - selected.watch.year) * 0.003));
    return (1 + yearRate) * ({ full: 1, papers: 0.96, watch: 0.9 }[selected.set]) * ({ Unworn: 1.06, Excellent: 1, Good: 0.88 }[selected.condition]);
  }

  const at = (selected, daysAgo) => amount(baseline(selected.watch, daysAgo) * factor(selected));
  const identity = watch => ({ id: watch.id, catalogueId: watch.id, brand: watch.brand, model: watch.model, reference: watch.reference, image: watch.image, year: watch.year });
  const provenance = () => ({ source: 'sample', asOf: AS_OF, currency: 'GBP' });

  function periodDays(period) {
    if (typeof period !== 'string' || !Object.hasOwn(PERIODS, period)) fail('PORTFOLIO_PERIOD', 'Choose 1M, 6M, 1Y or All.');
    return PERIODS[period];
  }

  function curve(selections, days) {
    const step = Math.max(1, Math.ceil(days / 74));
    const points = [];
    for (let remaining = days; remaining > 0; remaining -= step) points.push({ date: new Date(ANCHOR - remaining * DAY).toISOString().slice(0, 10), valueGBP: selections.reduce((sum, item) => sum + at(item, remaining), 0) });
    points.push({ date: AS_OF, valueGBP: selections.reduce((sum, item) => sum + at(item, 0), 0) });
    return points;
  }

  function valuation(selected) {
    const valueGBP = at(selected, 0);
    return {
      ...identity(selected.watch), year: selected.year, set: selected.set, condition: selected.condition,
      valueGBP, lowGBP: amount(valueGBP * 0.94), highGBP: amount(valueGBP * 1.06),
      changeWeek: percent(valueGBP, at(selected, 7)), changeMonth: percent(valueGBP, at(selected, 30)), change6M: percent(valueGBP, at(selected, 183)),
      regions: [{ id: 'uk', name: 'United Kingdom', premiumPercent: 0 }, { id: 'us', name: 'United States', premiumPercent: 3.5 }, { id: 'hk', name: 'Hong Kong', premiumPercent: -2.5 }].map(region => ({ ...region, valueGBP: amount(valueGBP * (1 + region.premiumPercent / 100)), currency: 'GBP', source: 'sample' })),
      history: curve([selected], 365), ...provenance()
    };
  }

  function create({ state, now = Date.now } = {}) {
    if (!plain(state)) fail('PORTFOLIO_INVALID', 'A private workspace is required.');
    if (typeof now !== 'function') fail('PORTFOLIO_INVALID', 'A portfolio clock function is required.');
    const clock = () => time(now);
    const latestMonth = () => stamp(clock()).slice(0, 7);
    clock();
    const descriptor = Object.getOwnPropertyDescriptor(state, 'portfolio');
    if (descriptor && !Object.hasOwn(descriptor, 'value')) fail('PORTFOLIO_INVALID', 'The portfolio must contain data only.');
    if (!descriptor || descriptor.value === undefined) state.portfolio = { version: VERSION, collection: [], following: [], rules: [], readAlerts: [], preferences: { weeklyDigest: true, priceAlerts: true }, nextId: 1 };
    const current = () => validate(state.portfolio, { now });
    current();
    const selections = entries => {
      list(entries, LIMITS.collection);
      const seen = new Set();
      return entries.map(entry => {
        const selected = choice(entry, latestMonth());
        if (entry.id && seen.has(entry.id)) fail('PORTFOLIO_INVALID', 'A collection identifier is duplicated.');
        if (entry.id) seen.add(entry.id);
        return selected;
      });
    };
    const catalogue = () => CATALOGUE.map(watch => valuation({ watch, year: watch.year, set: 'full', condition: 'Excellent' }));
    const find = id => typeof id === 'string' && BY_ID.has(id) ? valuation({ watch: BY_ID.get(id), year: BY_ID.get(id).year, set: 'full', condition: 'Excellent' }) : null;
    const quote = input => valuation(choice(input, latestMonth()));
    const collection = () => clone(current().collection);
    const following = () => [...current().following];
    const rules = () => clone(current().rules);
    const history = (options = {}) => {
      object(options, ['catalogueId', 'entries', 'period'], []);
      const { catalogueId, entries, period = '1M' } = options;
      if (catalogueId !== undefined && entries !== undefined) fail('PORTFOLIO_INVALID', 'Choose one reference or a collection for the chart.');
      const selected = catalogueId === undefined ? selections(entries === undefined ? current().collection : entries) : [choice({ catalogueId }, latestMonth())];
      return curve(selected, periodDays(period));
    };
    const summary = (entries = current().collection, period = '1M') => {
      const selected = selections(entries), days = periodDays(period);
      const valueGBP = selected.reduce((sum, item) => sum + at(item, 0), 0);
      const previousGBP = selected.reduce((sum, item) => sum + at(item, days), 0);
      return { valueGBP, lowGBP: selected.reduce((sum, item) => sum + amount(at(item, 0) * 0.94), 0), highGBP: selected.reduce((sum, item) => sum + amount(at(item, 0) * 1.06), 0), previousGBP, changeGBP: valueGBP - previousGBP, changePercent: percent(valueGBP, previousGBP), valuedCount: selected.length, count: entries.length, ...provenance() };
    };
    const next = prefix => {
      const portfolio = current();
      if (portfolio.nextId >= 1000000000) fail('PORTFOLIO_LIMIT', 'This portfolio cannot create another identifier.');
      return prefix + portfolio.nextId;
    };
    const purchaseChanges = input => {
      const changes = {};
      if (Object.hasOwn(input, 'purchasePriceGBP') && input.purchasePriceGBP !== undefined) changes.purchasePriceGBP = purchasePrice(input.purchasePriceGBP);
      if (Object.hasOwn(input, 'purchaseDate') && input.purchaseDate !== undefined) changes.purchaseDate = input.purchaseDate === null || input.purchaseDate === '' ? null : purchaseMonth(input.purchaseDate, latestMonth());
      return changes;
    };
    function add(input) {
      object(input, ['catalogueId', 'year', 'set', 'condition', 'image', 'serial', 'serviceHistory', ...PURCHASE_KEYS], ['catalogueId']);
      const purchase = purchaseChanges(input), clean = { ...input };
      for (const key of PURCHASE_KEYS) delete clean[key];
      const selected = choice(clean, latestMonth()), portfolio = current();
      if (portfolio.collection.length >= LIMITS.collection) fail('PORTFOLIO_LIMIT', 'Your portfolio can hold up to 100 watches.');
      const entry = { id: next('pc-'), catalogueId: selected.watch.id, year: selected.year, set: selected.set, condition: selected.condition, image: input.image || '', serial: (input.serial || '').trim(), serviceHistory: (input.serviceHistory || '').trim(), addedAt: stamp(clock()) };
      if (Object.hasOwn(purchase, 'purchasePriceGBP')) entry.purchasePriceGBP = purchase.purchasePriceGBP;
      if (purchase.purchaseDate) entry.purchaseDate = purchase.purchaseDate;
      portfolio.collection.push(entry); portfolio.nextId++;
      return clone(entry);
    }
    function updatePurchase(id, patch) {
      object(patch, PURCHASE_KEYS, []);
      const changes = purchaseChanges(patch), portfolio = current();
      const entry = portfolio.collection.find(item => item.id === id);
      if (!entry) fail('PORTFOLIO_ENTRY', 'Choose a watch in your own collection.');
      if (Object.hasOwn(changes, 'purchasePriceGBP')) entry.purchasePriceGBP = changes.purchasePriceGBP;
      if (Object.hasOwn(changes, 'purchaseDate')) {
        if (changes.purchaseDate === null) delete entry.purchaseDate;
        else entry.purchaseDate = changes.purchaseDate;
      }
      return clone(entry);
    }
    function remove(id) {
      const portfolio = current(), index = portfolio.collection.findIndex(entry => entry.id === id);
      if (index < 0) return false;
      portfolio.collection.splice(index, 1);
      portfolio.readAlerts = portfolio.readAlerts.filter(alert => alert !== 'price-' + id);
      return true;
    }
    function toggleFollow(catalogueId) {
      reference(catalogueId);
      const portfolio = current(), index = portfolio.following.indexOf(catalogueId);
      if (index >= 0) { portfolio.following.splice(index, 1); portfolio.readAlerts = portfolio.readAlerts.filter(id => id !== 'market-' + catalogueId); return false; }
      portfolio.following.push(catalogueId); return true;
    }
    function addRule(input) {
      object(input, ['catalogueId', 'direction', 'targetGBP']); reference(input.catalogueId); threshold(input);
      const portfolio = current();
      if (portfolio.rules.length >= LIMITS.rules) fail('PORTFOLIO_LIMIT', 'Your portfolio can hold up to 100 price alerts.');
      if (portfolio.rules.some(rule => rule.catalogueId === input.catalogueId && rule.direction === input.direction && rule.targetGBP === input.targetGBP)) fail('PORTFOLIO_DUPLICATE', 'This price alert already exists.');
      const rule = { id: next('pr-'), catalogueId: input.catalogueId, direction: input.direction, targetGBP: input.targetGBP, createdAt: stamp(clock()) };
      portfolio.rules.push(rule); portfolio.nextId++; return clone(rule);
    }
    function removeRule(id) {
      const portfolio = current(), index = portfolio.rules.findIndex(rule => rule.id === id);
      if (index < 0) return false;
      portfolio.rules.splice(index, 1); portfolio.readAlerts = portfolio.readAlerts.filter(alert => alert !== 'price-' + id); return true;
    }
    function preferences(patch) {
      const portfolio = current();
      if (patch !== undefined) {
        object(patch, ['weeklyDigest', 'priceAlerts'], []);
        if (Object.values(patch).some(value => typeof value !== 'boolean')) fail('PORTFOLIO_INVALID', 'Portfolio preferences must be on or off.');
        Object.assign(portfolio.preferences, patch);
      }
      return { ...portfolio.preferences };
    }
    function digest() {
      const portfolio = current(), selected = selections(portfolio.collection);
      const movements = selected.map((item, index) => {
        const valueGBP = at(item, 0), previousGBP = at(item, 7);
        return { selected: item, collectionId: portfolio.collection[index].id, valueGBP, previousGBP, changeGBP: valueGBP - previousGBP, changePercent: percent(valueGBP, previousGBP) };
      });
      const valueGBP = movements.reduce((sum, item) => sum + item.valueGBP, 0), previous = movements.reduce((sum, item) => sum + item.previousGBP, 0);
      const leading = movements.slice().sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || Math.abs(b.changeGBP) - Math.abs(a.changeGBP) || a.collectionId.localeCompare(b.collectionId))[0];
      const topMover = leading ? { ...valuation(leading.selected), collectionId: leading.collectionId, previousGBP: leading.previousGBP, changeGBP: leading.changeGBP, changePercent: leading.changePercent } : null;
      return { valueGBP, changeGBP: valueGBP - previous, changePercent: percent(valueGBP, previous), topMover, watchCount: selected.length, ...provenance() };
    }
    function alerts() {
      const portfolio = current(), result = [];
      const addAlert = item => result.push({ ...item, date: AS_OF, read: portfolio.readAlerts.includes(item.id), ...provenance() });
      if (portfolio.preferences.priceAlerts) {
        for (const entry of portfolio.collection) {
          const selected = choice(entry, latestMonth());
          const valueGBP = at(selected, 0), previousGBP = at(selected, 7), changeGBP = valueGBP - previousGBP;
          if (changeGBP === 0) continue;
          const changePercent = percent(valueGBP, previousGBP), watch = selected.watch;
          const setLabel = { full: 'full set', papers: 'papers only', watch: 'watch only' }[selected.set];
          addAlert({ id: 'price-' + entry.id, type: 'price', catalogueId: entry.catalogueId, collectionId: entry.id, year: selected.year, set: selected.set, condition: selected.condition, valueGBP, previousGBP, changeGBP, changePercent, title: watch.brand + ' ' + watch.model + ' · your sample weekly movement', body: 'Sample value for your ' + selected.year + ' watch (' + setLabel + ', ' + selected.condition + '): ' + valueGBP + ' GBP, ' + (changeGBP > 0 ? 'up ' : 'down ') + Math.abs(changeGBP) + ' GBP (' + (changePercent > 0 ? '+' : '') + changePercent + '%) over the seven days ending ' + AS_OF + '. In-app example, not live monitoring.' });
        }
        for (const rule of portfolio.rules) {
          const watch = find(rule.catalogueId);
          if (rule.direction === 'above' ? watch.valueGBP >= rule.targetGBP : watch.valueGBP <= rule.targetGBP) addAlert({ id: 'price-' + rule.id, type: 'price', catalogueId: rule.catalogueId, ruleId: rule.id, title: watch.brand + ' ' + watch.model + ' reached your sample target', body: 'Illustrative value: ' + watch.valueGBP + ' GBP. Your ' + rule.direction + ' target: ' + rule.targetGBP + ' GBP. This is not a live price alert.' });
        }
        for (const id of portfolio.following) {
          const watch = find(id);
          addAlert({ id: 'market-' + id, type: 'market', catalogueId: id, title: watch.brand + ' ' + watch.model + ' · sample week', body: 'The sample price changed ' + (watch.changeWeek >= 0 ? '+' : '') + watch.changeWeek + '% over the seven days ending ' + AS_OF + '.' });
        }
      }
      if (portfolio.preferences.weeklyDigest && portfolio.collection.length) {
        const weekly = digest();
        addAlert({ id: 'digest-' + AS_OF, type: 'digest', title: 'Your sample weekly portfolio digest', body: weekly.watchCount + ' watch' + (weekly.watchCount === 1 ? '' : 'es') + ' · ' + weekly.valueGBP + ' GBP illustrative value · ' + (weekly.changePercent >= 0 ? '+' : '') + weekly.changePercent + '% over the sample week. No email was sent.' });
      }
      return result;
    }
    function markRead(id) {
      const portfolio = current();
      if (!alerts().some(alert => alert.id === id)) return false;
      if (!portfolio.readAlerts.includes(id)) portfolio.readAlerts.push(id);
      return true;
    }
    return Object.freeze({ catalogue, find, quote, history, summary, collection, add, updatePurchase, remove, following, toggleFollow, rules, addRule, removeRule, alerts, markRead, digest, preferences });
  }

  const api = Object.freeze({ create, validate, VERSION, AS_OF, LIMITS });
  root.WatchifyPortfolioModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
