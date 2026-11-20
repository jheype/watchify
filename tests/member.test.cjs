'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/domain.js');

const source = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function setup() {
  const calls = { renders: 0, toasts: [], modals: [] };
  const sandbox = {
    location: { hash: 'account' },
    document: { getElementById: () => null },
    FormData: class {
      constructor(form) { this.values = form.values || {}; }
      get(key) { return Object.hasOwn(this.values, key) ? this.values[key] : null; }
      has(key) { return Object.hasOwn(this.values, key); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source('data.js'), sandbox);
  vm.runInContext(source('member.js'), sandbox);
  const state = {
    watches: structuredClone(sandbox.WatchifyData.watches),
    saved: [], activity: [], syncBusy: false, syncAt: 'Not yet simulated', uploadBusy: false,
    sell: { step: 1, photos: [], busy: false, watchId: 'santos', year: 2018, condition: 'Very good', box: true, papers: true, askingPrice: null },
    sellDraft: false
  };
  const byId = id => state.watches.find(w => w.id === id);
  const member = sandbox.WatchifyMember.create({
    state, byId, money: D.formatMoney, esc, icon: () => '<svg></svg>',
    toast: message => calls.toasts.push(message),
    openModal: (title, html) => calls.modals.push({ title, html }), closeModal() {},
    render: () => calls.renders++, route: () => ['account'], card: () => ''
  });
  const click = (action, id, extra = {}) => member.handleClick(action, { dataset: { id, ...extra } });
  const submit = (id, offerId, values, valid = true) => member.handleSubmit({ id, dataset: { id: offerId }, values, reportValidity: () => valid });
  return { state, member, byId, click, submit, calls, sandbox };
}

test('accepting an offer claims the watch once and closes competing offers', () => {
  const { state, byId, click } = setup();
  const before = state.member.sales.length;
  click('member-confirm-accept', 'OF-2401');
  assert.equal(byId('submariner').status, 'sold');
  assert.equal(state.member.offers.find(o => o.id === 'OF-2401').status, 'accepted');
  assert.equal(state.member.offers.find(o => o.id === 'OF-2403').status, 'unavailable');
  const saleId = byId('submariner').memberSaleId;
  click('member-confirm-accept', 'OF-2401');
  click('member-confirm-accept', 'OF-2403');
  assert.equal(state.member.sales.length, before + 1);
  assert.equal(byId('submariner').memberSaleId, saleId);
  assert.equal(state.member.sales.find(s => s.id === saleId).amount, 9500);
});

test('an acceptance dialog becomes stale when availability or ownership changes', () => {
  for (const change of [w => { w.status = 'reserved'; }, w => { w.status = 'paused'; }, w => { w.status = 'sold'; }, w => { w.status = 'pending_review'; }, w => { w.owned = false; }]) {
    const { state, byId, click, calls } = setup();
    click('member-accept-offer', 'OF-2401');
    assert.equal(calls.modals.length, 1);
    const before = state.member.sales.length;
    change(byId('submariner'));
    click('member-confirm-accept', 'OF-2401');
    assert.equal(state.member.sales.length, before);
    assert.equal(state.member.offers[0].status, 'pending');
  }
});

test('counteroffers reject invalid amounts and stale submissions without changing the offer', () => {
  for (const amount of ['', 'NaN', 'Infinity', '99', '-200', '100.5', '1000001', '9007199254740992']) {
    const { state, submit } = setup();
    submit('member-counter-form', 'OF-2401', { amount });
    assert.equal(state.member.offers[0].status, 'pending', amount);
    assert.equal(state.member.offers[0].amount, 9500, amount);
  }
  const { state, byId, click, submit } = setup();
  click('member-counter-offer', 'OF-2401');
  byId('submariner').status = 'reserved';
  submit('member-counter-form', 'OF-2401', { amount: '9900' });
  assert.equal(state.member.offers[0].status, 'pending');
  assert.equal(state.member.offers[0].amount, 9500);
});

test('a counteroffer retains the original amount and requires simulated buyer acceptance', () => {
  const { state, byId, submit, click } = setup();
  submit('member-counter-form', 'OF-2401', { amount: '9800' });
  assert.equal(state.member.offers[0].status, 'countered');
  assert.equal(state.member.offers[0].amount, 9800);
  assert.equal(state.member.offers[0].originalAmount, 9500);
  click('member-confirm-accept', 'OF-2401');
  assert.equal(byId('submariner').status, 'active');
  click('member-buyer-accept', 'OF-2401');
  assert.equal(byId('submariner').status, 'sold');
  assert.equal(state.member.sales[0].amount, 9800);
});

test('sale progression rejects skipped and repeated transitions', () => {
  const { state, click } = setup();
  const sale = state.member.sales[0];
  click('member-advance-sale', sale.id, { next: 'completed' });
  assert.equal(sale.status, 'dispatch');
  for (const next of ['transit', 'inspection', 'completed']) {
    click('member-advance-sale', sale.id, { next });
    assert.equal(sale.status, next);
    click('member-advance-sale', sale.id, { next });
    assert.equal(sale.status, next);
  }
});

test('all member routes render and escape editable profile and listing content', () => {
  const { state, member, byId } = setup();
  const payload = '<img src=x onerror="alert(1)">';
  state.member.profile.nickname = payload;
  state.member.profile.showroom = payload;
  byId('submariner').model = payload;
  for (const section of ['overview', 'listings', 'offers', 'sales', 'purchases', 'settings', 'unknown']) {
    const html = member.render(section);
    assert.ok(html.includes('member-page'));
    assert.equal(html.includes(payload), false, section);
    assert.ok(html.includes('&lt;img'), section);
  }
});

test('unknown actions and forms fall through to the owning app', () => {
  const { click, submit, state } = setup();
  assert.equal(click('save', 'santos'), false);
  assert.equal(click('member-no-such-action', 'santos'), false);
  assert.equal(submit('offer-form', 'santos', { offer: '5500' }), false);
  assert.equal(state.activity.length, 0);
});

test('a second saved draft after publishing remains visible and resumes its exact details', () => {
  const { state, member, byId, click, sandbox } = setup();
  state.sellDraft = true;
  member.onPublish({ ...byId('santos'), id: 'published-example', owned: true });
  assert.equal(state.sellDraft, false);
  assert.equal(member.counts().drafts, 0);

  Object.assign(state.sell, {
    step: 4, watchId: 'speedmaster', year: 2020, condition: 'Good',
    box: false, papers: true, askingPrice: 4321,
    photos: [{ url: 'assets/speedmaster.webp', name: 'Front', role: 'Front & dial', local: false }]
  });
  state.sellDraft = true;
  const saved = structuredClone(state.sell);
  assert.equal(member.counts().drafts, 1);
  click('member-listing-filter', undefined, { filter: 'draft' });
  const html = member.render('listings');
  assert.ok(html.includes('Speedmaster Moonwatch'));
  assert.ok(html.includes(byId('speedmaster').reference));
  assert.ok(html.includes('£4,321'));
  assert.ok(html.includes('step 4 of 5'));
  click('member-resume-draft');
  assert.equal(sandbox.location.hash, 'sell');
  assert.deepEqual(state.sell, saved);
  assert.equal(state.sellDraft, true);
});

test('new submissions enter the review queue without increasing live inventory or creating a sale', () => {
  const { state, member, byId, click } = setup();
  const before = member.counts();
  const salesBefore = state.member.sales.length;
  const submission = {
    ...byId('santos'), id: 'new-submission', owned: true, status: 'pending_review',
    reviewStatus: 'pending', conditionSource: 'seller', polishing: 'polished',
    wearHistory: 'worn', visibleWear: 'minor', condition: 'Very good'
  };
  state.watches.push(submission);
  member.onPublish(submission);
  assert.equal(member.counts().reviews, before.reviews + 1);
  assert.equal(member.counts().listings, before.listings);
  assert.equal(state.member.sales.length, salesBefore);
  assert.equal(state.member.listingFilter, 'pending_review');
  click('member-listing-filter', undefined, { filter: 'active' });
  assert.equal(state.member.listingFilter, 'active');
  click('member-listing-filter', undefined, { filter: 'pending_review' });
  assert.equal(state.member.listingFilter, 'pending_review');
  assert.equal(submission.status, 'pending_review');
});
