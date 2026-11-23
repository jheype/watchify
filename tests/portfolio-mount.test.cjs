'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Real app bootstrap, compatibility stores, portfolio/analytics models and views. The DOM
// stub only records rendered markup and registered events; it supplies no prices
// or collection records and never replaces the model's validation.
async function firstAccount(initialHash = '#portfolio') {
  const nodes = new Map();
  const events = { document: new Map(), window: new Map() };
  const calls = { authenticated: 0, restored: 0, synced: [], fatal: 0, focused: [], blobs: [], downloads: [], revoked: [] };
  const delayed = new Map();
  const register = (target, name, callback) => {
    if (!events[target].has(name)) events[target].set(name, []);
    events[target].get(name).push(callback);
  };
  const node = selector => {
    if (!nodes.has(selector)) {
      const classes = new Set();
      nodes.set(selector, {
        innerHTML: '', textContent: '', open: false,
        classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: value => classes.delete(value) },
        addEventListener() {}, focus() { calls.focused.push(selector); }, close() { this.open = false; },
        showModal() { this.open = true; }, querySelector: child => node(selector + ' ' + child)
      });
    }
    return nodes.get(selector);
  };
  const experience = source('index.html').match(/data-watchify-experience="([^"]+)"/)?.[1];
  let state, activeAccount = true;
  const sandbox = {
    URL: class TestURL extends URL {
      static createObjectURL(blob) { calls.blobs.push(blob); return 'blob:report-' + calls.blobs.length; }
      static revokeObjectURL(url) { calls.revoked.push(url); }
    }, Blob,
    setTimeout(callback, delay, ...args) {
      if (delay < 1000) return setTimeout(callback, delay, ...args);
      const id = Symbol('ui timer'); delayed.set(id, () => callback(...args)); return id;
    },
    clearTimeout(id) { if (!delayed.delete(id)) clearTimeout(id); },
    FormData: class TestFormData { constructor(form) { this.values = form.values; } get(key) { return this.values[key] ?? null; } },
    location: { hash: initialHash },
    WATCHIFY_CONFIG: { mode: 'zeit-preview' },
    WatchifyPreview: {
      async authenticate() { calls.authenticated++; return true; },
      async restoreWorkspace(value) { calls.restored++; state = value; },
      assertActive() { if (!activeAccount) throw Object.assign(new Error('The signed-in account changed.'), { code: 'AUTH_CHANGED' }); },
      startSync() { calls.synced.push(JSON.parse(JSON.stringify(state.portfolio))); },
      fatal() { calls.fatal++; }
    },
    document: {
      documentElement: { dataset: { watchifyExperience: experience } },
      body: node('body'), activeElement: null,
      querySelector: node,
      getElementById: id => node('#' + id),
      createElement(tag) {
        assert.equal(tag, 'a');
        return { click() { calls.downloads.push({ href: this.href, download: this.download }); } };
      },
      addEventListener: (name, callback) => register('document', name, callback)
    },
    addEventListener: (name, callback) => register('window', name, callback),
    scrollTo() {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ['domain', 'data', 'workspace-store', 'community', 'business', 'profile', 'member', 'portfolio-model', 'analytics-model', 'portfolio-views', 'analytics-views', 'vendor/pdf-lib.min', 'valuation-report', 'portfolio']) {
    vm.runInContext(source('src/' + file + '.js'), sandbox, { filename: file + '.js' });
  }
  await vm.runInContext(source('src/app.js'), sandbox, { filename: 'app.js' });
  sandbox.__testState = state;
  async function navigate(hash) {
    sandbox.location.hash = hash;
    for (const callback of events.window.get('hashchange') || []) await callback();
  }
  async function click(target) {
    const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const callback of events.document.get('click') || []) await callback(event);
    return event;
  }
  return {
    sandbox, state, calls, navigate,
    html: () => node('#main').innerHTML,
    modal: () => node('#modal').innerHTML,
    toast: () => node('#toast').textContent,
    addWatch(input) { return vm.runInContext('WatchifyPortfolioModel.create({state:__testState}).add(' + JSON.stringify(input) + ')', sandbox); },
    async settle() { await new Promise(setImmediate); },
    async pagehide() { for (const callback of events.window.get('pagehide') || []) await callback(); },
    async change(id, value) {
      const target = { id, value, closest: () => true };
      for (const callback of events.document.get('change') || []) await callback({ target });
    },
    async submit(id, values) {
      for (const callback of events.document.get('submit') || []) await callback({ target: { id, values }, preventDefault() {} });
    },
    flushDelayed() { for (const callback of delayed.values()) callback(); delayed.clear(); },
    deferReport() {
      let resolve, reject, count = 0;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      sandbox.WatchifyValuationReport = { generate() { count++; return promise; } };
      return { resolve, reject, calls: () => count };
    },
    expireAccount() { activeAccount = false; },
    async clickAction(pfAction, id, value) {
      const target = { dataset: { pfAction, id, value }, closest: selector => selector === '[data-pf-action]' ? target : null };
      return click(target);
    },
    async activateSkipLink() {
      const href = source('index.html').match(/<a\b[^>]*class="skip-link"[^>]*href="([^"]+)"/)?.[1];
      assert.equal(href, '#main', 'the real page exposes a skip link to its main landmark');
      const target = { closest: selector => selector === '.skip-link' ? target : null };
      const event = await click(target);
      // Model the browser's anchor default: an uncancelled click changes the hash.
      if (!event.defaultPrevented) await navigate(href);
      return event;
    }
  };
}

test('a first account renders and opens example watch values without persisting example ownership', async () => {
  const h = await firstAccount();
  assert.equal(h.calls.authenticated, 1);
  assert.equal(h.calls.restored, 1);
  assert.equal(h.calls.fatal, 0, 'the real portfolio mount must finish instead of falling into the fatal gate');
  assert.equal(h.calls.synced.length, 1, 'cloud synchronisation starts only after the home view renders');
  assert.match(h.html(), /<h1\b/);
  assert.match(h.html(), /<svg\b[^>]*role="img"/);
  assert.doesNotMatch(h.html(), /NaN|Infinity|undefined/);

  const catalogue = h.sandbox.WatchifyPortfolioModel.create({ state: h.state }).catalogue();
  const knownIds = new Set(catalogue.map(watch => watch.id));
  const links = [...h.html().matchAll(/href="(#(?:watch|collection)\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(links.length >= 5, 'the empty account gets usable reference links in its example view');
  for (const href of links) {
    assert.ok(href.startsWith('#watch/'), 'examples open reference values, not nonexistent owned records');
    assert.ok(knownIds.has(decodeURIComponent(href.slice('#watch/'.length))), href);
  }
  for (const stored of [h.state.portfolio, h.calls.synced[0]]) {
    assert.equal(stored.collection.length, 0, 'rendered examples never become this account’s possessions');
    assert.equal(stored.rules.length, 0);
    assert.equal(stored.following.length, 0);
    assert.equal(stored.nextId, 1, 'viewing examples must not consume a private record identifier');
  }

  const destination = links[0];
  await h.navigate(destination);
  const watch = catalogue.find(item => item.id === decodeURIComponent(destination.slice('#watch/'.length)));
  assert.ok(h.html().includes(watch.reference), 'an example link opens the corresponding real reference detail');
  assert.doesNotMatch(h.html(), /NaN|Infinity|undefined/);
  await h.navigate('#portfolio');
  assert.equal(h.calls.fatal, 0);
  assert.equal(h.state.portfolio.collection.length, 0, 'returning home still does not claim ownership');
  assert.equal(h.state.portfolio.nextId, 1);
});

test('skip to content focuses the main landmark without changing the selected portfolio route', async () => {
  const h = await firstAccount();
  await h.navigate('#market');
  const before = h.html(), stored = JSON.stringify(h.state.portfolio);
  h.calls.focused.length = 0;
  const event = await h.activateSkipLink();
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.sandbox.location.hash, '#market');
  assert.deepEqual(h.calls.focused, ['#main']);
  assert.equal(h.html(), before, 'the skip link does not reroute or replace the current screen');
  assert.equal(JSON.stringify(h.state.portfolio), stored);
});

test('the main-landmark hash left by the sign-in skip link opens the portfolio home', async () => {
  const h = await firstAccount('#main');
  assert.equal(h.calls.fatal, 0);
  assert.equal(h.calls.synced.length, 1);
  assert.equal(h.sandbox.location.hash, '#main', 'rendering the home alias does not rewrite the location');
  assert.equal(h.sandbox.document.title, 'Your collection — Watchify');
  assert.match(h.html(), /<svg\b[^>]*role="img"/);
  assert.equal(h.state.portfolio.collection.length, 0);
});

test('an account change blocks a rendered portfolio action before it can mutate private state', async () => {
  const h = await firstAccount();
  const before = JSON.stringify(h.state.portfolio);
  h.expireAccount();
  await h.clickAction('follow', 'submariner');
  assert.equal(JSON.stringify(h.state.portfolio), before);
  assert.equal(h.state.portfolio.following.length, 0);
  assert.equal(h.calls.synced.length, 1, 'the cancelled action cannot start another account lifecycle');
});

test('an empty account opens Analytics, sample indices and trading without inventing ownership', async () => {
  const h = await firstAccount('#analytics');
  assert.equal(h.calls.fatal, 0);
  assert.equal(h.sandbox.document.title, 'Analytics — Watchify');
  assert.match(h.html(), /Your collection is the starting point/);
  assert.doesNotMatch(h.html(), /data-pf-action="valuation-report"|NaN|Infinity|undefined/);
  const before = JSON.stringify(h.state.portfolio);
  await h.clickAction('analytics-tab', undefined, 'indices');
  assert.match(h.html(), /Watchify Sample Index/);
  assert.match(h.html(), /Basket weight/);
  assert.match(h.html(), /<svg\b[^>]*role="img"/);
  await h.clickAction('analytics-index', undefined, 'Rolex');
  assert.match(h.html(), /Rolex Sample Index/);
  await h.clickAction('analytics-tab', undefined, 'trading');
  assert.match(h.html(), /Typical time to sell/);
  assert.match(h.html(), /No observed sales feed is connected/);
  assert.match(h.html(), /Sample active listings/);
  await h.change('pf-analytics-watch', 'santos');
  assert.match(h.html(), /Trading context for Cartier Santos/);
  assert.doesNotMatch(h.html(), /NaN|Infinity|undefined/);
  assert.equal(JSON.stringify(h.state.portfolio), before);
});

test('personal analytics and watch details use only recorded costs and save purchase corrections through the form', async () => {
  const h = await firstAccount();
  const entry = h.addWatch({ catalogueId: 'santos', purchasePriceGBP: 5000.25, purchaseDate: '2024-02', serial: 'PRIVATE-123' });
  h.addWatch({ catalogueId: 'submariner' });
  await h.navigate('#analytics');
  assert.match(h.html(), /1 of 2 watches with a recorded purchase price/);
  assert.match(h.html(), /Partial coverage/);
  assert.match(h.html(), /Gain on recorded purchases/);
  assert.match(h.html(), /data-pf-action="valuation-report"/);
  await h.clickAction('analytics-brand', undefined, 'Cartier');
  assert.match(h.html(), /Cartier in your collection/);
  assert.ok(h.html().includes('#collection/' + entry.id));
  await h.navigate('#collection/' + entry.id);
  assert.match(h.html(), /Since you bought it/);
  assert.match(h.html(), /2024/);
  assert.match(h.html(), /PRIVATE-123/);
  await h.clickAction('purchase-info', entry.id);
  assert.match(h.modal(), /value="5000.25"/);
  await h.submit('pf-purchase-form', { entryId: entry.id, purchasePriceGBP: '5200.50', purchaseDate: '2025-03' });
  const saved = h.state.portfolio.collection.find(item => item.id === entry.id);
  assert.equal(saved.purchasePriceGBP, 5200.5);
  assert.equal(saved.purchaseDate, '2025-03');
  assert.match(h.toast(), /purchase details have been updated/);
  await h.navigate('#analytics');
  assert.match(h.html(), /1 of 2 watches with a recorded purchase price/);
  assert.doesNotMatch(h.html(), /NaN|Infinity|undefined/);
});

test('the real valuation action downloads a PDF and releases its temporary object URL', async () => {
  const h = await firstAccount();
  h.addWatch({ catalogueId: 'santos', serial: 'OWN-123' });
  await h.navigate('#analytics');
  await h.clickAction('valuation-report');
  await h.settle();
  assert.equal(h.calls.downloads.length, 1);
  assert.match(h.calls.downloads[0].download, /^watchify-collection-valuation-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(h.calls.blobs[0].type, 'application/pdf');
  const bytes = Buffer.from(await h.calls.blobs[0].arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(h.toast(), /PDF has been downloaded/);
  h.flushDelayed();
  assert.deepEqual(h.calls.revoked, [h.calls.downloads[0].href]);
});

test('a pending valuation cancels on account, collection, currency, name or page lifecycle changes', async () => {
  for (const changed of ['account', 'collection', 'currency', 'name', 'pagehide']) {
    const h = await firstAccount();
    h.addWatch({ catalogueId: 'santos' });
    await h.navigate('#analytics');
    const pending = h.deferReport();
    await h.clickAction('valuation-report');
    assert.match(h.html(), /data-pf-action="valuation-report" disabled aria-busy="true"/);
    await h.clickAction('valuation-report');
    assert.equal(pending.calls(), 1, 'a second click cannot start a parallel report');
    if (changed === 'account') h.expireAccount();
    if (changed === 'collection') h.addWatch({ catalogueId: 'submariner' });
    if (changed === 'currency') await h.change('pf-currency', 'EUR');
    if (changed === 'name') h.state.member.profile.nickname = 'Another name';
    if (changed === 'pagehide') await h.pagehide();
    const before = h.html(), toastBefore = h.toast();
    pending.resolve(new Uint8Array([37, 80, 68, 70, 45]));
    await h.settle();
    assert.equal(h.calls.downloads.length, 0, changed);
    assert.equal(h.calls.blobs.length, 0, changed + ': no temporary object URL is created');
    if (changed === 'account' || changed === 'pagehide') {
      assert.equal(h.html(), before, changed + ': no late render');
      assert.equal(h.toast(), toastBefore, changed + ': no late notification');
    } else assert.match(h.toast(), /collection changed while the PDF was prepared/);
  }
});

test('a failed report cannot notify or rerender an account that ended while it was being generated', async () => {
  for (const changed of ['account', 'pagehide']) {
    const h = await firstAccount();
    h.addWatch({ catalogueId: 'santos' });
    await h.navigate('#analytics');
    const pending = h.deferReport();
    await h.clickAction('valuation-report');
    if (changed === 'account') h.expireAccount();
    else await h.pagehide();
    const before = h.html(), toastBefore = h.toast();
    pending.reject(new Error('The old account report failed.'));
    await h.settle();
    assert.equal(h.calls.downloads.length, 0);
    assert.equal(h.html(), before);
    assert.equal(h.toast(), toastBefore);
  }
});
