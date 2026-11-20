'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../src/workspace-store.js');
require('../src/data.js');

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
function setup() {
  let time = NOW;
  const state = {
    watches: structuredClone(globalThis.WatchifyData.watches), activity: [],
    member: { profile: { nickname: 'Joao Almeida', showroom: 'Alder & Co.' }, offers: [
      { id: 'OF-2401', watchId: 'submariner', buyer: 'Sam R.', amount: 9500, originalAmount: 9500, status: 'pending' },
      { id: 'OF-2403', watchId: 'submariner', buyer: 'Casey W.', amount: 9250, originalAmount: 9250, status: 'pending' }
    ], sales: [{ id: 'SL-1038', watchId: null, title: 'Tudor Black Bay Fifty-Eight', reference: '79030N', image: 'assets/black-bay.webp', amount: 2600, buyer: 'Taylor M.', status: 'dispatch', source: 'seed' }] }
  };
  const byId = id => state.watches.find(w => w.id === id);
  const store = create({ state, byId, now: () => time });
  return { store, state, byId, setTime: value => { time = value; } };
}

test('workspace imports legacy sales once, preserves ownership and keeps seed purchase reserved', () => {
  const { store, state, byId } = setup();
  store.sync(); store.sync();
  assert.equal(store.orders().filter(o => o.id === 'SL-1038').length, 1);
  assert.equal(store.order('SL-1038').kind, 'sale');
  assert.equal(store.dealerId(byId('santos')), 'joao-almeida');
  assert.equal(byId('santos').dealer, state.member.profile.showroom);
  assert.equal(byId('cartier-tank').status, 'reserved');
  assert.equal(store.dealer('maison').listings.some(w => w.id === 'cartier-tank'), false);
});

test('accepting an incoming purchase offer creates one order and claims the exact listing', () => {
  const { store, byId } = setup();
  const before = store.orders().length;
  const order = store.respondOffer('DM-102', 'MSG-106', 'accept');
  assert.equal(order.kind, 'purchase'); assert.equal(order.amountGBP, 10700); assert.equal(order.status, 'awaiting_payment');
  assert.equal(store.conversation('DM-102').orderId, order.id);
  assert.equal(byId('datejust').workspaceOrderId, order.id); assert.equal(byId('datejust').status, 'reserved');
  assert.equal(store.orders().length, before + 1);
  assert.throws(() => store.respondOffer('DM-102', 'MSG-106', 'accept'), { code: 'OFFER_UNAVAILABLE' });
  assert.equal(store.orders().length, before + 1);
  assert.equal(store.ledger().some(t => t.orderId === order.id), false);
});

test('accepting an incoming sale offer creates one legacy sale and closes competing offers', () => {
  const { store, state, byId } = setup();
  const result = store.respondOffer('DM-101', 'MSG-103', 'accept');
  assert.equal(result.kind, 'sale'); assert.equal(result.amountGBP, 9500);
  assert.equal(byId('submariner').memberSaleId, result.id);
  assert.equal(state.member.sales.filter(o => o.id === result.id).length, 1);
  assert.equal(state.member.offers[1].status, 'unavailable');
  store.sync(); store.sync();
  assert.equal(store.orders().filter(o => o.id === result.id).length, 1);
  assert.throws(() => store.respondOffer('DM-101', 'MSG-103', 'accept'), { code: 'OFFER_UNAVAILABLE' });
});

test('new messages remain local outgoing content; blank, oversized and arbitrary threads fail', () => {
  const { store } = setup();
  const before = store.conversation('DM-101').messages.length;
  const sent = store.sendMessage('DM-101', '<img src=x> My question');
  assert.equal(sent.sender, 'me'); assert.equal(sent.type, 'text'); assert.equal(sent.text, '<img src=x> My question');
  assert.equal(store.conversation('DM-101').messages.length, before + 1);
  assert.throws(() => store.sendMessage('DM-101', ' '), { code: 'INVALID_TEXT' });
  assert.throws(() => store.sendMessage('DM-101', 'x'.repeat(2001)), { code: 'INVALID_TEXT' });
  assert.throws(() => store.sendMessage('missing', 'hello'), { code: 'CONVERSATION_NOT_FOUND' });
  assert.equal(store.markRead('DM-101').unread, 0);
});

test('outgoing offers cannot be self-accepted and stale listing offers cannot produce orders', () => {
  const { store, byId } = setup();
  const sent = store.makeOffer('DM-102', 10500);
  assert.throws(() => store.respondOffer('DM-102', sent.id, 'accept'), { code: 'OFFER_UNAVAILABLE' });
  assert.throws(() => store.makeOffer('DM-102', 10550), { code: 'OFFER_PENDING' });
  const before = store.orders().length;
  byId('datejust').status = 'paused';
  assert.throws(() => store.respondOffer('DM-102', 'MSG-106', 'accept'), { code: 'WATCH_UNAVAILABLE' });
  assert.equal(store.orders().length, before);
  for (const invalid of [99, 100.1, 1000001, NaN, Infinity, '9500']) assert.throws(() => store.makeOffer('DM-101', invalid), { code: 'INVALID_AMOUNT' });
});

test('a legacy counteroffer closes the original DM offer and remains unacceptably outgoing', () => {
  const { store, state } = setup();
  state.member.offers[0].status = 'countered'; state.member.offers[0].amount = 9800;
  store.sync(); store.sync();
  const messages = store.conversation('DM-101').messages;
  assert.equal(messages.find(m => m.id === 'MSG-103').status, 'countered');
  const outgoing = messages.filter(m => m.sender === 'me' && m.type === 'offer');
  assert.equal(outgoing.length, 1); assert.equal(outgoing[0].amountGBP, 9800);
  assert.throws(() => store.respondOffer('DM-101', 'MSG-103', 'accept'), { code: 'OFFER_UNAVAILABLE' });
  state.member.offers[0].status = 'accepted'; store.sync();
  assert.equal(outgoing[0].status, 'accepted');
  assert.equal(messages.find(m => m.id === 'MSG-103').status, 'countered');
});

test('DM counteroffers update legacy offers once and do not create an order without the peer', () => {
  const { store, state } = setup();
  const before = store.orders().length;
  const sent = store.respondOffer('DM-101', 'MSG-103', 'counter', 9850);
  assert.equal(sent.sender, 'me'); assert.equal(sent.status, 'pending');
  assert.equal(state.member.offers[0].amount, 9850); assert.equal(state.member.offers[0].status, 'countered');
  store.sync(); store.sync();
  assert.equal(store.conversation('DM-101').messages.filter(m => m.type === 'offer' && m.sender === 'me').length, 1);
  assert.equal(store.orders().length, before);
});

test('order progression enforces the current participant role and updates legacy sale state', () => {
  const { store, state } = setup();
  assert.equal(store.nextOrderAction('SL-1038').next, 'transit');
  store.advanceOrder('SL-1038');
  assert.equal(state.member.sales[0].status, 'transit');
  assert.throws(() => store.advanceOrder('SL-1038'), { code: 'ORDER_ACTION_UNAVAILABLE' });
  state.member.sales[0].status = 'inspection'; store.sync();
  assert.equal(store.order('SL-1038').status, 'inspection');
  assert.throws(() => store.advanceOrder('SL-1038'), { code: 'ORDER_ACTION_UNAVAILABLE' });
  store.advanceOrder('WF-P1044'); assert.equal(store.order('WF-P1044').status, 'inspection');
  store.advanceOrder('WF-P1044'); assert.equal(store.order('WF-P1044').status, 'completed');
  assert.throws(() => store.advanceOrder('WF-P1044'), { code: 'ORDER_ACTION_UNAVAILABLE' });
});

test('legacy reservations join orders without duplicate rows and cancelled reservations leave revenue alone', () => {
  const { store, state, byId } = setup();
  const revenue = store.metrics().revenue;
  state.activity.push({ type: 'reserve', id: 'WF-R001', watchId: 'datejust', amount: 10950 });
  store.sync(); store.sync();
  assert.equal(store.orders().filter(o => o.id === 'WF-R001').length, 1);
  assert.equal(store.order('WF-R001').status, 'awaiting_payment');
  assert.equal(byId('datejust').workspaceOrderId, 'WF-R001');
  state.activity = []; store.sync();
  assert.equal(store.order('WF-R001').status, 'cancelled');
  assert.equal(store.metrics().revenue, revenue);
  assert.equal(store.ledger().some(t => t.orderId === 'WF-R001'), false);
  assert.equal(byId('datejust').workspaceOrderId, undefined); assert.equal(byId('datejust').status, 'active');
});

test('a completed reserved purchase marks its own listing sold without releasing another order claim', () => {
  const { store, state, byId } = setup();
  state.activity.push({ type: 'reserve', id: 'WF-R002', watchId: 'datejust', amount: 10950 });
  store.sync(); store.advanceOrder('WF-R002');
  const record = store.order('WF-R002');
  record.status = 'transit'; // Delivery provider event in this controlled fixture.
  store.advanceOrder(record.id); store.advanceOrder(record.id);
  assert.equal(record.status, 'completed'); assert.equal(byId('datejust').status, 'sold');
  state.activity = []; store.sync();
  assert.equal(byId('datejust').status, 'sold'); assert.equal(store.order(record.id).status, 'completed');
});

test('historical order conversations retain order context without rebinding a current listing', () => {
  const { store } = setup();
  const c = store.openOrderConversation('SL-1038');
  assert.equal(c.watchId, null); assert.equal(c.orderId, 'SL-1038'); assert.equal(c.peerRole, 'buyer');
  assert.equal(c.title, 'Tudor Black Bay Fifty-Eight');
  assert.equal(store.openOrderConversation('SL-1038').id, c.id);
  assert.throws(() => store.makeOffer(c.id, 2500), { code: 'WATCH_UNAVAILABLE' });
  assert.ok(store.dealer(c.peerId));
});

test('reviews require completed trades, reject duplicates and publish to the reviewed peer profile', () => {
  const { store } = setup();
  assert.throws(() => store.addReview('SL-1038', 5, 'Great seller'), { code: 'REVIEW_NOT_ELIGIBLE' });
  assert.throws(() => store.addReview('WF-P1039', 0, 'Great seller'), { code: 'INVALID_RATING' });
  const before = store.dealer('northline').reviewCount;
  const review = store.addReview('WF-P1039', 4, 'Clear condition notes and prompt answers.');
  assert.equal(review.direction, 'given'); assert.equal(review.role, 'buyer');
  assert.equal(store.dealer('northline').reviewCount, before + 1);
  assert.ok(store.dealer('northline').reviews.some(r => r.id === review.id && r.peerName === 'Joao Almeida'));
  assert.throws(() => store.addReview('WF-P1039', 5, 'Again'), { code: 'REVIEW_EXISTS' });
  store.addReview('WF-S1041', 5, 'A lovely buyer.');
  assert.equal(store.dealer('alex-m').reviewCount, 1);
  assert.equal(store.dealer('alex-m').reviews[0].peerName, 'Joao Almeida');
});

test('promotion pricing is fixed, restricted to live owned listings and charged once locally', () => {
  const { store, byId } = setup();
  assert.throws(() => store.promote('datejust', 'spotlight'), { code: 'PROMOTION_NOT_ELIGIBLE' });
  assert.throws(() => store.promote('submariner', 'arbitrary'), { code: 'INVALID_PLAN' });
  const campaign = store.promote('submariner', 'spotlight');
  assert.equal(campaign.costGBP, 24);
  assert.throws(() => store.promote('submariner', 'featured'), { code: 'PROMOTION_EXISTS' });
  store.togglePromotion(campaign.id); store.togglePromotion(campaign.id);
  assert.equal(store.ledger().filter(t => t.type === 'promotion').length, 1);
  assert.equal(store.metrics().promotionSpend, 24);
  byId('submariner').status = 'sold'; store.sync();
  assert.equal(campaign.status, 'paused');
  assert.throws(() => store.togglePromotion(campaign.id), { code: 'PROMOTION_NOT_ELIGIBLE' });
});

test('campaign expiration ends delivery but does not generate repeat charges', () => {
  const { store, setTime } = setup();
  const campaign = store.promote('submariner', 'spotlight');
  setTime(NOW + 8 * 86400000); store.sync();
  assert.equal(campaign.status, 'completed');
  assert.throws(() => store.togglePromotion(campaign.id), { code: 'PROMOTION_FINISHED' });
  assert.equal(store.ledger().filter(t => t.type === 'promotion').length, 1);
});

test('recommended placement follows active plan priority, pause, resume and expiry without new charges', () => {
  const { store, byId, setTime } = setup();
  const source = ['speedmaster', 'submariner', 'santos', 'gmt-pepsi'].map(byId);
  const original = source.slice();
  const spotlight = store.promote('submariner', 'spotlight');
  const featured = store.promote('santos', 'featured');
  assert.equal(store.promotionFor('submariner').id, spotlight.id);
  assert.deepEqual(store.rankListings(source).map(w => w.id), ['santos', 'submariner', 'speedmaster', 'gmt-pepsi']);
  assert.deepEqual(source, original);
  store.togglePromotion(featured.id);
  assert.equal(store.promotionFor('santos'), null);
  assert.deepEqual(store.rankListings(source).map(w => w.id), ['submariner', 'speedmaster', 'santos', 'gmt-pepsi']);
  store.togglePromotion(featured.id);
  assert.equal(store.rankListings(source)[0].id, 'santos');
  setTime(NOW + 8 * 86400000);
  assert.equal(store.promotionFor('submariner'), null);
  assert.equal(store.promotionFor('santos').id, featured.id);
  assert.deepEqual(store.rankListings(source).map(w => w.id), ['santos', 'speedmaster', 'submariner', 'gmt-pepsi']);
  setTime(NOW + 15 * 86400000);
  assert.deepEqual(store.rankListings(source), original);
  assert.equal(store.promotionFor('santos'), null);
  assert.equal(store.ledger().filter(t => t.type === 'promotion').length, 2);
});

test('paid placement respects explicit sorts and does not inject filtered-out or unavailable listings', () => {
  const { store, byId } = setup();
  store.promote('submariner', 'featured');
  const priceOrder = ['speedmaster', 'santos', 'submariner'].map(byId);
  const explicit = store.rankListings(priceOrder, 'price-low');
  assert.deepEqual(explicit, priceOrder); assert.notEqual(explicit, priceOrder);
  assert.deepEqual(store.rankListings(priceOrder, 'price-high'), priceOrder);
  assert.deepEqual(store.rankListings([byId('speedmaster'), byId('santos')]).map(w => w.id), ['speedmaster', 'santos']);
  byId('submariner').status = 'sold';
  assert.equal(store.promotionFor('submariner'), null);
  assert.deepEqual(store.rankListings(priceOrder), priceOrder);
  assert.equal(store.promotionFor('datejust'), null);
});

test('analytics reconcile to settled ledger entries and period filters without treating cash flow as profit', () => {
  const { store } = setup();
  const m = store.metrics(30);
  assert.equal(m.revenue, 29800); assert.equal(m.purchases, 2450); assert.equal(m.fees, 1490); assert.equal(m.net, 25860);
  assert.equal(m.salesCount, 3); assert.equal(m.purchasesCount, 1);
  assert.equal(store.metrics(7).revenue, 10250); assert.equal(store.metrics(90).revenue, 35400);
  assert.equal(m.chart.length, 30);
  assert.equal(m.chart.reduce((sum, p) => sum + p.revenue, 0), m.revenue);
  assert.equal(m.chart.reduce((sum, p) => sum + p.views, 0), m.views);
  const before = m.net; store.promote('submariner', 'spotlight');
  assert.equal(store.metrics(30).net, before - 24); assert.equal(store.metrics(30).fees, 1490);
  const unique = store.ledger().map(t => t.id); assert.equal(new Set(unique).size, unique.length);
});

test('profile updates are atomic, propagate owned listings and reject unsafe URLs or avatar payloads', () => {
  const { store, state, byId } = setup();
  const original = state.member.profile.nickname;
  assert.throws(() => store.updateProfile({ nickname: 'Changed', website: 'javascript:alert(1)' }), { code: 'INVALID_WEBSITE' });
  assert.equal(state.member.profile.nickname, original);
  assert.throws(() => store.updateProfile({ avatar: 'data:image/svg+xml,<svg onload=alert(1)>' }), { code: 'INVALID_AVATAR' });
  assert.throws(() => store.updateProfile({ avatar: 'https://example.invalid/photo.jpg' }), { code: 'INVALID_AVATAR' });
  assert.throws(() => store.updateProfile({ mfaEnabled: true }), { code: 'INVALID_PROFILE' });
  store.updateProfile({ nickname: 'Joao Almeida', showroom: 'Almeida Watches', location: 'São Paulo, Brazil', website: 'https://example.com/', avatar: 'data:image/jpeg;base64,/9j/AA==' });
  assert.equal(byId('santos').dealer, 'Almeida Watches'); assert.equal(byId('submariner').location, 'São Paulo, Brazil');
  assert.equal(store.dealer('joao-almeida').showroom, 'Almeida Watches');
  assert.equal(store.dealer('northline').reviewCount, store.dealer('northline').reviews.length);
  assert.equal(store.dealer('unknown'), null);
});

test('opening conversations prevents self-dealing and wrong external dealer identities', () => {
  const { store } = setup();
  assert.throws(() => store.openConversation('submariner'), { code: 'INVALID_PARTICIPANT' });
  assert.throws(() => store.openConversation('submariner', 'joao-almeida'), { code: 'INVALID_PARTICIPANT' });
  assert.throws(() => store.openConversation('datejust', 'maison'), { code: 'INVALID_PARTICIPANT' });
  assert.equal(store.openConversation('datejust').id, 'DM-102');
  assert.equal(store.openConversation('submariner', 'sam-r').id, 'DM-101');
});
