'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const snapshot = require('../src/workspace-snapshot.js');
const { create: createStore } = require('../src/workspace-store.js');
require('../src/data.js');

function makeState() {
  const state = {
    watches: structuredClone(globalThis.WatchifyData.watches), saved: ['submariner'], currency: 'GBP', activity: [], activitySequence: 0,
    sell: { step: 1, photos: [], sample: false, busy: false, watchId: 'santos', condition: 'Very good', box: true, papers: true, year: 2018, askingPrice: null, description: '' },
    sellDraft: false, listingSequence: 0, syncAt: 'Not yet synced', syncCount: 0,
    member: { profile: { nickname: 'Joao Almeida', showroom: 'Alder & Co.' }, draft: { id: 'draft-santos-01', title: 'Santos de Cartier', complete: false }, offers: [], sales: [], notices: [], sequence: 1 },
    live: { session: { csrfToken: 'must-never-leave-browser' } }, liveController: new AbortController(), toastTimer: setTimeout(() => {}, 1000)
  };
  clearTimeout(state.toastTimer);
  createStore({ state, now: () => Date.parse('2026-11-20T12:00:00Z') });
  return state;
}

test('snapshot round-trip preserves business activity and shares the restored profile with the workspace', async () => {
  const state = makeState();
  const store = createStore({ state });
  store.sendMessage('DM-101', 'My tester note');
  store.updateProfile({ nickname: 'Zeit Tester', showroom: 'Zeit Preview', location: 'London' });
  const saved = await snapshot.capture(state);
  const target = { live: { session: null }, uploadBusy: false };
  snapshot.restore(target, saved);
  assert.equal(target.member.profile.nickname, 'Zeit Tester');
  assert.equal(target.workspace.profile, target.member.profile);
  assert.equal(target.workspace.conversations[0].messages.at(-1).text, 'My tester note');
  assert.deepEqual(target.saved, ['submariner']);
  const restoredStore = createStore({ state: target });
  assert.equal(restoredStore.conversation('DM-101').messages.at(-1).text, 'My tester note');
  assert.equal(target.live.session, null);
});

test('snapshots never include authentication, credential, simulated security, File or runtime state', async () => {
  const state = makeState();
  state.member.security = { password: 'secret', sessions: [{ token: 'secret' }] };
  state.member.profile.refreshToken = 'secret';
  state.sell.analysis = { id: 'old-session-evidence' };
  state.sell.quote = { id: 'old-session-quote' };
  state.sell.assetIds = ['temporary'];
  const saved = await snapshot.capture(state);
  const text = JSON.stringify(saved);
  assert.doesNotMatch(text, /must-never|secret|old-session|temporary|csrfToken|toastTimer|liveController/);
  assert.equal(saved.state.sell.busy, undefined);
  assert.equal(saved.state.member.security, undefined);
  assert.equal(saved.state.workspace.profile, undefined);
});

test('blob photos are encoded once, retained after reload and never fetched from arbitrary hosts', async () => {
  const state = makeState();
  const file = new File([Uint8Array.from([255, 216, 255, 224, 1, 2, 3])], 'watch.jpg', { type: 'image/jpeg' });
  state.sell.photos = [{ url: 'blob:test-local-photo', file, local: true, role: 'Front & dial', name: 'watch.jpg' }];
  state.sell.liveMode = true; state.sell.step = 4; state.sell.analysis = { id: 'expired' };
  state.sellDraft = true;
  state.watches[0].image = 'blob:test-local-photo';
  state.watches[0].photos[0].src = 'blob:test-local-photo';
  const saved = await snapshot.capture(state, { fetchBlob: () => assert.fail('An available file must not be fetched') });
  assert.equal(Object.keys(saved.media).length, 1);
  assert.equal(saved.state.watches[0].image, saved.state.sell.photos[0].url);
  const restored = snapshot.restore({}, saved);
  assert.match(restored.sell.photos[0].url, /^data:image\/jpeg;base64,/);
  assert.equal(restored.sell.photos[0].file.type, 'image/jpeg');
  assert.equal(restored.sell.photos[0].file.size, file.size);
  assert.equal(restored.sell.photos[0].local, false);
  assert.equal(restored.sell.step, 1);
  assert.equal(restored.sell.identityConfirmed, false);
  state.watches[0].image = 'https://attacker.example/tracker.png';
  await assert.rejects(snapshot.capture(state, { fetchBlob: () => assert.fail('External media must not be fetched') }), { code: 'SNAPSHOT_MEDIA' });
});

test('capture takes a consistent copy before asynchronous photo conversion', async () => {
  const state = makeState();
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  state.sell.photos = [{ url: 'blob:existing-photo', local: true }];
  const capture = snapshot.capture(state, { fetchBlob: async () => { await ready; return { ok: true, blob: async () => new Blob([Uint8Array.from([255, 216, 255])], { type: 'image/jpeg' }) }; } });
  state.member.profile.nickname = 'Changed after capture';
  release();
  const saved = await capture;
  assert.equal(saved.state.member.profile.nickname, 'Joao Almeida');
});

function manualState() {
  const state = makeState();
  Object.assign(state.sell, {
    liveMode: true, assessmentMode: 'manual', sample: false, step: 5,
    identity: { brand: 'Rolex', model: 'Datejust', reference: '126300' }, identityConfirmed: true,
    condition: 'Very good', polishing: 'unknown', wearHistory: 'worn', visibleWear: 'minor',
    conditionConfirmed: true, listingConfirmed: true, askingPrice: 6500,
    photos: [{ url: 'data:image/jpeg;base64,/9j/4AECAw==', name: 'my-watch.jpg', role: 'Front & dial' }]
  });
  state.sellDraft = true;
  return state;
}

test('manual drafts resume with their validated details and require fresh publication confirmation', async () => {
  const state = manualState();
  state.sell.analysis = { id: 'old-session-assessment' };
  state.sell.quote = { price: 9999 };
  const restored = snapshot.restore({}, await snapshot.capture(state));
  assert.equal(restored.sell.step, 5);
  assert.deepEqual(restored.sell.identity, state.sell.identity);
  assert.equal(restored.sell.identityConfirmed, true);
  assert.equal(restored.sell.conditionConfirmed, true);
  assert.equal(restored.sell.listingConfirmed, false);
  assert.equal(restored.sell.askingPrice, 6500);
  assert.equal(restored.sell.analysis, undefined);
  assert.equal(restored.sell.quote, undefined);
  assert.equal(restored.sell.photos[0].file.name, 'my-watch.jpg');
});

test('restored photo filenames match the actual saved MIME type for manual publishing', async () => {
  const state = manualState();
  state.sell.photos[0].name = 'original-photo.png';
  const restored = snapshot.restore({}, await snapshot.capture(state));
  const photo = restored.sell.photos[0];
  assert.equal(photo.name, 'original-photo.jpg');
  assert.equal(photo.file.type, 'image/jpeg');
  assert.equal(require('../src/domain.js').validatePhoto(photo.file), null);
  assert.equal(restored.sell.step, 5);
});

test('manual draft recovery returns to the first incomplete declaration without losing user input', async () => {
  const cases = [
    { edit: state => { state.sell.photos = []; }, step: 1, identity: false, condition: false },
    { edit: state => { state.sell.photos[0].url = 'assets/watches/santos.webp'; }, step: 1, identity: false, condition: false },
    { edit: state => { state.sell.identity.reference = '  '; }, step: 2, identity: false, condition: false },
    { edit: state => { state.sell.identityConfirmed = false; }, step: 2, identity: false, condition: false },
    { edit: state => { state.sell.condition = 'Unworn'; }, step: 3, identity: true, condition: false },
    { edit: state => { state.sell.conditionConfirmed = false; }, step: 3, identity: true, condition: false },
    { edit: state => { state.sell.askingPrice = null; }, step: 4, identity: true, condition: true }
  ];
  for (const fixture of cases) {
    const state = manualState(); fixture.edit(state);
    const restored = snapshot.restore({}, await snapshot.capture(state));
    assert.equal(restored.sell.step, fixture.step);
    assert.equal(restored.sell.identityConfirmed, fixture.identity);
    assert.equal(restored.sell.conditionConfirmed, fixture.condition);
    assert.equal(restored.sell.listingConfirmed, false);
    assert.equal(restored.sell.identity.brand, 'Rolex');
  }
});

test('AI drafts still require new local evidence after reload and unknown modes fail closed', async () => {
  const state = manualState(); state.sell.assessmentMode = 'ai';
  const saved = await snapshot.capture(state);
  const restored = snapshot.restore({}, saved);
  assert.equal(restored.sell.step, 1);
  assert.equal(restored.sell.identityConfirmed, false);
  assert.equal(restored.sell.conditionConfirmed, false);
  assert.equal(restored.sell.listingConfirmed, false);
  saved.state.sell.assessmentMode = 'verified';
  const target = { untouched: true };
  assert.throws(() => snapshot.restore(target, saved), { code: 'SNAPSHOT_INVALID' });
  assert.deepEqual(target, { untouched: true });
});

test('invalid, oversized and incompatible snapshots fail without modifying the current workspace', async () => {
  const saved = await snapshot.capture(makeState());
  const target = { current: 'untouched' };
  const badMedia = structuredClone(saved);
  badMedia.state.watches[0].image = 'javascript:alert(1)';
  assert.throws(() => snapshot.restore(target, badMedia), { code: 'SNAPSHOT_MEDIA' });
  assert.deepEqual(target, { current: 'untouched' });
  assert.throws(() => snapshot.restore(target, { ...saved, schemaVersion: 999 }), { code: 'SNAPSHOT_VERSION' });
  const invalid = structuredClone(saved); invalid.state.workspace.orders = null;
  assert.throws(() => snapshot.restore(target, invalid), { code: 'SNAPSHOT_INVALID' });
  const malicious = JSON.parse(JSON.stringify(saved));
  Object.defineProperty(malicious.state.member.profile, '__proto__', { enumerable: true, value: { polluted: true } });
  assert.throws(() => snapshot.restore(target, malicious), { code: 'SNAPSHOT_INVALID' });
  assert.equal({}.polluted, undefined);
  const oversized = structuredClone(saved); oversized.state.sell.description = 'x'.repeat(snapshot.MAX_BYTES);
  assert.throws(() => snapshot.restore(target, oversized), { code: 'SNAPSHOT_TOO_LARGE' });
  assert.deepEqual(target, { current: 'untouched' });
});

test('malformed records and nested arrays fail before restore changes the running state', async () => {
  const saved = await snapshot.capture(makeState());
  const mutations = [
    value => { value.state.workspace.orders = [null]; },
    value => { value.state.workspace.orders[0].history = [null]; },
    value => { value.state.workspace.orders[0].createdAt = {}; },
    value => { value.state.workspace.conversations[0].messages = [null]; },
    value => { value.state.workspace.listingStats[0].trend = [null]; },
    value => { value.state.member.sales = [null]; },
    value => { value.state.member.draft = null; },
    value => { value.state.workspace.reviews = [null]; }
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(saved); mutate(invalid);
    const target = { preserved: true };
    assert.throws(() => snapshot.restore(target, invalid), { code: 'SNAPSHOT_INVALID' });
    assert.deepEqual(target, { preserved: true });
  }
});

test('a complete backup can exceed the cloud limit without dropping current edits or photos', async () => {
  const state = makeState();
  const body = new Uint8Array(7 * 1024 * 1024); body[0] = 255; body[1] = 216; body[2] = 255;
  const file = new File([body], 'large-watch.jpg', { type: 'image/jpeg' });
  state.sell.photos = [{ url: 'blob:large-photo', file, local: true, name: 'large-watch.jpg', role: 'Front & dial' }];
  state.sell.description = 'Current work that must not be replaced by an older backup';
  await assert.rejects(snapshot.capture(state), { code: 'SNAPSHOT_TOO_LARGE' });
  const backup = await snapshot.captureBackup(state);
  assert.equal(backup.state.sell.description, state.sell.description);
  assert.ok(Buffer.byteLength(JSON.stringify(backup)) > snapshot.MAX_BYTES);
  assert.equal(Object.keys(backup.media).length, 1);
  assert.throws(() => snapshot.validate(backup), { code: 'SNAPSHOT_TOO_LARGE' });
  assert.doesNotThrow(() => snapshot.validate(backup, { forExport: true }));
});

test('real member and business modules survive a snapshot round-trip after simulated transactions', async () => {
  require('../src/community.js'); require('../src/business.js'); require('../src/profile.js'); require('../src/member.js');
  const state = makeState(); delete state.member; delete state.workspace;
  const context = current => ({
    state: current, byId: id => current.watches.find(watch => watch.id === id), money: value => 'GBP ' + value,
    esc: value => String(value ?? ''), icon: () => '', toast() {}, openModal() {}, closeModal() {}, render() {}, route: () => ['account']
  });
  const member = globalThis.WatchifyMember.create(context(state));
  member.store.sendMessage('DM-101', 'A persisted test conversation');
  member.store.promote('submariner', 'spotlight');
  member.store.respondOffer('DM-102', 'MSG-106', 'accept');
  member.render('accounting', 'invoices');
  state.business.billing.company = 'Zeit Preview';
  state.business.scannerSaved = ['datejust'];
  const saved = await snapshot.capture(state);
  const restored = snapshot.restore({ compare: [] }, saved);
  const restoredMember = globalThis.WatchifyMember.create(context(restored));
  assert.equal(restored.business.billing.company, 'Zeit Preview');
  assert.deepEqual(restored.business.scannerSaved, ['datejust']);
  assert.ok(Object.keys(restored.business.invoiceSnapshots).length > 0);
  assert.equal(restoredMember.store.conversation('DM-101').messages.at(-1).text, 'A persisted test conversation');
  for (const section of ['overview', 'orders', 'messages', 'analytics', 'accounting', 'promotion', 'profile']) assert.doesNotThrow(() => restoredMember.render(section));
});
