'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

// Exercise the actual app event handlers, with only browser presentation APIs stubbed.
// The member module's normal create(ctx) boundary gives us its shared app state.
function setup() {
  const listeners = { document: new Map(), window: new Map() };
  const nodes = new Map(), revoked = [], timers = new Map();
  let captured, timerId = 0, currentHash = '#sell';
  function node(selector) {
    if (nodes.has(selector)) return nodes.get(selector);
    const classes = new Set();
    const el = {
      id: selector.startsWith('#') ? selector.slice(1) : '', dataset: {},
      value: '', textContent: '', innerHTML: '', style: {}, open: false,
      isConnected: true, focusCount: 0,
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, force) { const add = force === undefined ? !classes.has(name) : force; add ? classes.add(name) : classes.delete(name); return add; }
      },
      setAttribute(name, value) { this[name] = String(value); },
      getAttribute(name) { return this[name]; },
      focus() { this.focusCount++; },
      scrollIntoView() {},
      getBoundingClientRect: () => ({ top: 100, left: 0, right: 900, bottom: 600, height: 500 }),
      addEventListener() {},
      querySelector: selector => node(selector),
      querySelectorAll: () => [],
      showModal() { this.open = true; },
      close() { this.open = false; }
    };
    nodes.set(selector, el);
    return el;
  }
  function listen(target, name, callback) {
    if (!listeners[target].has(name)) listeners[target].set(name, []);
    listeners[target].get(name).push(callback);
  }
  const location = {};
  Object.defineProperty(location, 'hash', {
    get: () => currentHash,
    set: value => { currentHash = String(value).startsWith('#') ? String(value) : '#' + value; }
  });
  const sandbox = {
    location,
    document: {
      querySelector: node, querySelectorAll: () => [], getElementById: id => node('#' + id),
      addEventListener: (name, callback) => listen('document', name, callback),
      activeElement: null, documentElement: node('html'), body: node('body')
    },
    localStorage: { getItem: () => null, setItem() {} },
    URL: { revokeObjectURL: url => revoked.push(url), createObjectURL: () => 'blob:test-created' },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => callback(),
    scrollTo() {}, scrollY: 0,
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, callback) => listen('window', name, callback),
    FormData: class { constructor(form) { this.values = form.values || {}; } get(key) { return this.values[key] ?? null; } has(key) { return Object.hasOwn(this.values, key); } }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['domain.js', 'data.js', 'member.js', 'selling.js']) vm.runInContext(source(file), sandbox, { filename: file });
  const memberModule = sandbox.WatchifyMember;
  sandbox.WatchifyMember = { create(ctx) { captured = ctx; return memberModule.create(ctx); } };
  vm.runInContext(source('app.js'), sandbox, { filename: 'app.js' });

  const click = (action, data = {}) => {
    const target = { dataset: { action, ...data }, closest: selector => selector === '[data-action]' ? target : null };
    for (const callback of listeners.document.get('click') || []) callback({ target, preventDefault() {} });
  };
  const field = (eventName, id, values = {}) => {
    const target = node('#' + id);
    Object.assign(target, values);
    for (const callback of listeners.document.get(eventName) || []) callback({ target, preventDefault() {} });
    return target;
  };
  const submit = (id, values = {}, dataset = {}) => {
    const target = { id, values, dataset, reportValidity: () => true };
    for (const callback of listeners.document.get('submit') || []) callback({ target, preventDefault() {} });
  };
  const pagehide = (event = {}) => { for (const callback of listeners.window.get('pagehide') || []) callback(event); };
  return { state: captured.state, byId: captured.byId, click, field, submit, pagehide, node, revoked, sandbox, timers };
}

const photos = () => [
  { url: 'blob:front', name: 'front.jpg', role: 'Front & dial', local: true },
  { url: 'blob:side', name: 'side.jpg', role: 'Other detail', local: true },
  { url: 'assets/santos-box.webp', name: 'box.webp', role: 'Box', local: false }
];
const urls = state => Array.from(state.sell.photos, p => p.url);
const declaration = () => ({
  condition: 'Very good', polishing: 'unpolished', wearHistory: 'worn', visibleWear: 'minor',
  conditionConfirmed: true, listingConfirmed: true, year: 2022, box: true, papers: true
});
const readySubmission = (overrides = {}) => ({
  ...declaration(), step: 5, askingPrice: 6000, photos: photos(), ...overrides
});

test('step navigation only returns to a completed step and blocks invalid, forward and busy requests', () => {
  const h = setup();
  h.state.sell.step = 3;
  for (const step of ['0', '-1', '3', '4', '6', '2.5', 'NaN', 'Infinity']) {
    h.click('sell-go-step', { step });
    assert.equal(h.state.sell.step, 3, step);
  }
  h.state.sell.busy = true;
  h.click('sell-go-step', { step: '2' });
  assert.equal(h.state.sell.step, 3);
  h.state.sell.busy = false;
  h.state.uploadBusy = true;
  h.click('sell-go-step', { step: '2' });
  assert.equal(h.state.sell.step, 3);
  h.state.uploadBusy = false;
  h.sandbox.location.hash = 'account/listings';
  h.click('sell-go-step', { step: '2' });
  assert.equal(h.state.sell.step, 3);
  h.sandbox.location.hash = 'sell';
  h.click('sell-go-step', { step: '2' });
  assert.equal(h.state.sell.step, 2);
  assert.ok(h.node('#sell-step-title').focusCount > 0);
});

test('a cover change preserves photo roles and order without revoking any photos', () => {
  const h = setup(); h.state.sell.photos = photos();
  h.click('set-cover', { index: '1' });
  assert.deepEqual(urls(h.state), ['blob:side', 'blob:front', 'assets/santos-box.webp']);
  assert.equal(h.state.sell.photos[0].role, 'Other detail');
  assert.deepEqual(h.revoked, []);
});

test('invalid and stale photo selections cannot remove another photo or select a nonexistent cover', () => {
  const h = setup(); h.state.sell.photos = photos();
  for (const index of ['-1', '3', '100', '1.5', 'NaN', 'Infinity', undefined]) {
    h.click('remove-photo', { index });
    h.click('set-cover', { index });
    assert.equal(h.state.sell.photos.length, 3, String(index));
  }
  h.click('remove-photo', { index: '2' });
  const after = urls(h.state);
  h.click('set-cover', { index: '2' }); // A tile from the previous photo list.
  h.click('remove-photo', { index: '2' });
  assert.deepEqual(urls(h.state), after);
  assert.deepEqual(h.revoked, []); // Removing a catalogue asset never revokes a blob URL.
});

test('photo mutations wait for uploads and analysis, and cover changes require the photo step', () => {
  const h = setup(); h.state.sell.photos = photos();
  for (const flag of ['uploadBusy', 'busy']) {
    if (flag === 'busy') h.state.sell.busy = true; else h.state.uploadBusy = true;
    h.click('set-cover', { index: '1' }); h.click('remove-photo', { index: '0' });
    assert.deepEqual(urls(h.state), ['blob:front', 'blob:side', 'assets/santos-box.webp']);
    h.state.uploadBusy = false; h.state.sell.busy = false;
  }
  h.state.sell.step = 2; h.click('set-cover', { index: '1' });
  assert.equal(h.state.sell.photos[0].url, 'blob:front');
  h.state.sell.step = 1; h.sandbox.location.hash = 'account'; h.click('set-cover', { index: '1' });
  assert.equal(h.state.sell.photos[0].url, 'blob:front');
});

test('removing the cover releases only that local URL and promotes the next photo', () => {
  const h = setup(); h.state.sell.photos = photos();
  h.click('remove-photo', { index: '0' });
  assert.deepEqual(h.revoked, ['blob:front']);
  assert.equal(h.state.sell.photos[0].url, 'blob:side');
});

test('publishing keeps the selected cover and local photo URLs alive until the page closes', () => {
  const h = setup(); h.state.sell.photos = photos();
  h.click('set-cover', { index: '1' });
  Object.assign(h.state.sell, declaration(), { step: 5, askingPrice: 6123, description: 'Light marks on the clasp.' });
  const before = h.state.watches.length;
  h.click('publish-demo');
  assert.equal(h.state.watches.length, before + 1);
  const listing = h.state.watches[h.state.watches.length - 1];
  assert.equal(listing.image, 'blob:side');
  assert.deepEqual(Array.from(listing.photos, p => p.src), ['blob:side', 'blob:front', 'assets/santos-box.webp']);
  assert.equal(listing.photos[0].label, 'Other detail');
  assert.equal(listing.price, 6123);
  assert.equal(listing.description, 'Light marks on the clasp.');
  assert.equal(listing.status, 'pending_review');
  assert.equal(listing.reviewStatus, 'pending');
  assert.equal(listing.conditionSource, 'seller');
  assert.equal(listing.polishing, 'unpolished');
  assert.equal(listing.wearHistory, 'worn');
  assert.equal(listing.visibleWear, 'minor');
  assert.equal(h.state.sell.photos.length, 0);
  assert.equal(h.state.sell.step, 1);
  assert.deepEqual(h.revoked, []);
  h.click('publish-demo'); // A delayed second click must not create a duplicate listing.
  assert.equal(h.state.watches.length, before + 1);

  h.sandbox.location.hash = 'sell';
  h.state.sell.photos = [{ url: 'blob:new-draft', name: 'new.jpg', role: 'Front & dial', local: true }];
  h.click('reset-sell');
  assert.deepEqual(h.revoked, ['blob:new-draft']);
  assert.equal(listing.image, 'blob:side');
  h.pagehide();
  assert.deepEqual([...h.revoked].sort(), ['blob:front', 'blob:new-draft', 'blob:side'].sort());
});

test('publication requires review, price, photos and both confirmations, with no work in progress', () => {
  for (const invalid of [
    { step: 4 }, { photos: [] }, { askingPrice: null }, { askingPrice: 99 },
    { askingPrice: 1000001 }, { askingPrice: 5000.5 }, { askingPrice: NaN }, { busy: true },
    { conditionConfirmed: false }, { conditionConfirmed: 'true' },
    { listingConfirmed: false }, { listingConfirmed: 'true' },
    { condition: 'Unworn', polishing: 'polished' },
    { wearHistory: '' }, { polishing: '' }, { visibleWear: '' },
    { year: 1899 }, { year: 2028 }, { year: '2022' }
  ]) {
    const h = setup();
    Object.assign(h.state.sell, readySubmission(invalid));
    const before = h.state.watches.length; h.click('publish-demo');
    assert.equal(h.state.watches.length, before);
    assert.deepEqual(h.revoked, []);
  }
  const h = setup(); Object.assign(h.state.sell, readySubmission());
  h.state.uploadBusy = true; const before = h.state.watches.length; h.click('publish-demo');
  assert.equal(h.state.watches.length, before);
});

test('back-forward cache preserves published and draft photos until a non-persisted pagehide', () => {
  const h = setup();
  Object.assign(h.state.sell, readySubmission());
  h.click('publish-demo');
  const listing = h.state.watches[h.state.watches.length - 1];
  h.sandbox.location.hash = 'sell';
  h.state.sell.photos = [{ url: 'blob:unfinished', name: 'next-watch.jpg', role: 'Front & dial', local: true }];
  h.state.sellDraft = true;
  const draftBefore = urls(h.state);
  const publishedBefore = Array.from(listing.photos, p => p.src);

  h.pagehide({ persisted: true });
  assert.deepEqual(h.revoked, []);
  assert.deepEqual(urls(h.state), draftBefore);
  assert.equal(h.state.sellDraft, true);
  assert.equal(listing.image, 'blob:front');
  assert.deepEqual(Array.from(listing.photos, p => p.src), publishedBefore);

  h.pagehide({ persisted: false });
  assert.equal(h.state.sell.photos.length, 0);
  assert.deepEqual([...h.revoked].sort(), ['blob:front', 'blob:side', 'blob:unfinished'].sort());
});

test('replacing photos with the catalogue resets the old asking price and releases abandoned uploads', () => {
  const h = setup();
  Object.assign(h.state.sell, { photos: photos(), watchId: 'speedmaster', askingPrice: 4321 });
  h.click('sample-photos');
  assert.equal(h.state.sell.watchId, 'santos');
  assert.equal(h.state.sell.askingPrice, null);
  assert.ok(h.state.sell.photos.length > 0);
  assert.ok(h.state.sell.photos.every(p => p.local === false));
  assert.deepEqual([...h.revoked].sort(), ['blob:front', 'blob:side']);
});

test('submitted watches await review and cannot be bought, offered on or relisted as live', () => {
  const h = setup();
  Object.assign(h.state.sell, readySubmission());
  const activeBefore = h.state.watches.filter(w => w.status === 'active').length;
  h.click('publish-demo');
  const listing = h.state.watches[h.state.watches.length - 1];
  assert.equal(listing.status, 'pending_review');
  assert.equal(h.state.watches.filter(w => w.status === 'active').length, activeBefore);
  assert.equal(h.state.member.listingFilter, 'pending_review');
  h.sandbox.location.hash = 'watch/' + listing.id;
  h.click('reserve', { id: listing.id });
  assert.equal(h.node('#modal').open, false);
  h.click('offer', { id: listing.id });
  assert.equal(h.node('#modal').open, false);
  h.click('confirm-reservation', { id: listing.id });
  h.submit('offer-form', { offer: '6000' }, { id: listing.id });
  h.click('toggle-listing', { id: listing.id });
  assert.equal(listing.status, 'pending_review');
  assert.equal(h.state.activity.length, 0);
});

test('condition and accessory edits invalidate both declarations before another submission', () => {
  const changes = [
    ['input', 'valuation-year', { value: '2021' }],
    ['change', 'valuation-condition', { value: 'Good' }],
    ['change', 'valuation-box', { checked: false }],
    ['change', 'valuation-papers', { checked: false }],
    ['change', 'polishing-choice', { name: 'polishing', value: 'polished', checked: true }],
    ['change', 'history-choice', { name: 'wear-history', value: 'unknown', checked: true }],
    ['change', 'wear-choice', { name: 'visible-wear', value: 'visible', checked: true }]
  ];
  for (const [eventName, id, values] of changes) {
    const h = setup(); Object.assign(h.state.sell, readySubmission());
    h.field(eventName, id, values);
    assert.equal(h.state.sell.conditionConfirmed, false, id);
    assert.equal(h.state.sell.listingConfirmed, false, id);
    const before = h.state.watches.length;
    h.click('publish-demo');
    assert.equal(h.state.watches.length, before, id);
  }
});

test('price and description edits require final reconfirmation without discarding the condition declaration', () => {
  for (const [id, value] of [['asking-price', '6500'], ['listing-description', 'Updated description.']]) {
    const h = setup(); Object.assign(h.state.sell, readySubmission());
    h.field('input', id, { value });
    assert.equal(h.state.sell.conditionConfirmed, true, id);
    assert.equal(h.state.sell.listingConfirmed, false, id);
    const before = h.state.watches.length;
    h.click('publish-demo');
    assert.equal(h.state.watches.length, before, id);
    h.field('change', 'listing-confirmed', { checked: true });
    h.click('publish-demo');
    assert.equal(h.state.watches.length, before + 1, id);
    const listing = h.state.watches[h.state.watches.length - 1];
    assert.equal(listing.status, 'pending_review');
    assert.equal(id === 'asking-price' ? listing.price : listing.description, id === 'asking-price' ? 6500 : value);
  }
});

test('changing the cover or photo evidence clears both condition and final confirmations', () => {
  for (const action of ['set-cover', 'remove-photo', 'sample-photos']) {
    const h = setup(); Object.assign(h.state.sell, readySubmission({ step: 1 }));
    h.click(action, { index: '1' });
    assert.equal(h.state.sell.conditionConfirmed, false, action);
    assert.equal(h.state.sell.listingConfirmed, false, action);
  }
  const h = setup(); Object.assign(h.state.sell, readySubmission({ step: 1 }));
  h.field('change', 'photo-role', { dataset: { photoRole: '0' }, value: 'Other detail' });
  assert.equal(h.state.sell.conditionConfirmed, false);
  assert.equal(h.state.sell.listingConfirmed, false);
});

test('the condition step blocks conflicting and unconfirmed claims before reaching pricing', () => {
  for (const invalid of [
    { condition: 'Unworn', wearHistory: 'unworn', polishing: 'polished', visibleWear: 'none' },
    { condition: 'Unworn', wearHistory: 'unknown', polishing: 'unpolished', visibleWear: 'none' },
    { condition: 'Excellent', visibleWear: 'visible' },
    { condition: 'Very good', visibleWear: 'visible' },
    { conditionConfirmed: false }
  ]) {
    const h = setup();
    Object.assign(h.state.sell, readySubmission({ step: 3, ...invalid }));
    h.node('#valuation-year').value = '2022';
    h.click('sell-next');
    assert.equal(h.state.sell.step, 3, JSON.stringify(invalid));
  }
  const h = setup();
  Object.assign(h.state.sell, readySubmission({ step: 3, condition: 'Good', visibleWear: 'visible', askingPrice: null }));
  h.node('#valuation-year').value = '2022';
  h.click('sell-next');
  assert.equal(h.state.sell.step, 4);
  assert.ok(Number.isInteger(h.state.sell.askingPrice));
});
