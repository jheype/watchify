'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../src/cloud-workspace.js');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const copy = value => JSON.parse(JSON.stringify(value));
const data = value => ({ schemaVersion: 1, kind: 'watchify-zeit-preview', note: value });
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}
function mockClient({ rows = new Map(), userId = USER_A } = {}) {
  const calls = [];
  const controller = { user: userId ? { id: userId, is_anonymous: false } : null, failBefore: false, failAfter: false, hold: null, holdAuth: null, holdRead: null, callbacks: [], rows, calls };
  const result = async query => {
    const actingId = controller.user?.id;
    const actingAnonymous = controller.user?.is_anonymous;
    calls.push({ table: query.table, kind: query.kind, filters: { ...query.filters }, actingId, payload: query.payload && copy(query.payload) });
    if (query.table === 'tester_workspaces' && controller.hold) { const hold = controller.hold; controller.hold = null; await hold; }
    if (query.table === 'tester_workspaces' && query.kind === 'select' && controller.holdRead) { const hold = controller.holdRead; controller.holdRead = null; await hold; }
    if (query.table === 'tester_workspaces' && controller.failBefore) { controller.failBefore = false; return { data: null, error: { status: 503, message: 'Unavailable' } }; }
    const id = query.filters.user_id || query.payload?.user_id;
    if (!actingId || actingAnonymous || actingId !== id) return { data: null, error: { code: '42501', message: 'RLS denied' } };
    const existing = rows.get(id);
    let row = existing;
    if (query.kind === 'insert') {
      if (existing) return { data: null, error: { code: '23505', message: 'Duplicate key' } };
      row = { snapshot: copy(query.payload.snapshot), save_id: query.payload.save_id, version: 1, updated_at: '2026-11-20T12:00:00.000Z' };
      rows.set(id, row);
    } else if (query.kind === 'update') {
      if (!existing || existing.version !== query.filters.version) return { data: null, error: null };
      row = { snapshot: copy(query.payload.snapshot), save_id: query.payload.save_id, version: existing.version + 1, updated_at: '2026-11-20T12:01:00.000Z' };
      rows.set(id, row);
    }
    if (controller.failAfter && query.kind !== 'select') { controller.failAfter = false; return { data: null, error: { status: 503, message: 'Reply lost after commit' } }; }
    return { data: row ? copy(row) : null, error: null };
  };
  const client = {
    supabaseUrl: 'https://test.supabase.co',
    auth: {
      getUser: async () => { const user = controller.user && { ...controller.user }; if (controller.holdAuth) { const hold = controller.holdAuth; controller.holdAuth = null; await hold; } return { data: { user }, error: null }; },
      onAuthStateChange: callback => { controller.callbacks.push(callback); return { data: { subscription: { unsubscribe() { controller.callbacks = controller.callbacks.filter(c => c !== callback); } } } }; }
    },
    from(table) {
      assert.equal(table, 'tester_workspaces');
      const query = { table, kind: 'select', filters: {}, payload: null };
      const builder = {
        select() { return builder; },
        eq(key, value) { query.filters[key] = value; return builder; },
        insert(payload) { query.kind = 'insert'; query.payload = payload; return builder; },
        update(payload) { query.kind = 'update'; query.payload = payload; return builder; },
        single() { return result(query); },
        maybeSingle() { return result(query); }
      };
      return builder;
    }
  };
  controller.signIn = id => { controller.user = id ? { id, is_anonymous: false } : null; controller.callbacks.forEach(callback => callback(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: controller.user } : null)); };
  return { client, controller };
}
const workspace = (client, options = {}) => create({ client, validateSnapshot: copy, storage: memoryStorage(), ...options });

test('signed-out and anonymous visitors cannot read or write tester snapshots', async () => {
  const { client, controller } = mockClient({ userId: null });
  const cloud = workspace(client);
  await assert.rejects(cloud.load(), { code: 'AUTH_REQUIRED' });
  await assert.rejects(cloud.save(data('unauthorised')), { code: 'LOAD_REQUIRED' });
  controller.user = { id: USER_A, is_anonymous: true };
  await assert.rejects(cloud.load(), { code: 'AUTH_REQUIRED' });
  assert.equal(controller.calls.length, 0);
});

test('first save and later saves are acknowledged only after server success', async () => {
  const { client, controller } = mockClient();
  const statuses = [];
  const cloud = workspace(client, { onStatus: status => statuses.push(status.state) });
  assert.equal(await cloud.load(), null);
  assert.equal(cloud.getStatus().state, 'ready');
  await cloud.save(data('first'));
  assert.equal(cloud.getStatus().version, 1);
  assert.equal(cloud.getStatus().state, 'saved');
  assert.equal(cloud.getStatus().pending, false);
  await cloud.save(data('second'));
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'second');
  assert.equal(cloud.getStatus().version, 2);
  const update = controller.calls.find(call => call.kind === 'update');
  assert.deepEqual(update.filters, { user_id: USER_A, version: 1 });
  assert.equal(update.payload.version, undefined, 'the server controls version increments');
  assert.equal(update.payload.updated_at, undefined, 'the server controls save timestamps');
  assert.ok(statuses.indexOf('saving') < statuses.indexOf('saved'));
});

test('changing accounts clears the active workspace and never accesses another tester row', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client);
  await cloud.load(); await cloud.save(data('A private data'));
  controller.signIn(USER_B);
  assert.equal(cloud.getStatus().state, 'signed_out');
  assert.equal(cloud.exportPending(), null);
  await assert.rejects(cloud.save(data('cross-account')), { code: 'LOAD_REQUIRED' });
  assert.equal(await cloud.load(), null);
  await cloud.save(data('B private data'));
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'A private data');
  assert.equal(controller.rows.get(USER_B).snapshot.note, 'B private data');
  assert.ok(controller.calls.every(call => call.filters.user_id === call.actingId || call.payload?.user_id === call.actingId));
});

test('two tabs cannot silently overwrite each other and a conflict retains the local snapshot', async () => {
  const rows = new Map();
  const first = mockClient({ rows }), second = mockClient({ rows });
  const left = workspace(first.client), right = workspace(second.client);
  await left.load(); await left.save(data('baseline'));
  await right.load(); await left.save(data('left newer copy'));
  await assert.rejects(right.save(data('right unsaved work')), { code: 'CONFLICT' });
  assert.equal(rows.get(USER_A).snapshot.note, 'left newer copy');
  assert.equal(right.getStatus().state, 'conflict');
  assert.equal(right.exportPending().note, 'right unsaved work');
  await assert.rejects(right.retry(), { code: 'CONFLICT' });
  await assert.rejects(right.load(), { code: 'UNSAVED_CHANGES' });
  const cloud = await right.load({ discardPending: true });
  assert.equal(cloud.snapshot.note, 'left newer copy');
  assert.equal(right.exportPending(), null);
});

test('lost success responses can be retried without duplicate versions or false conflict', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client);
  await cloud.load(); await cloud.save(data('baseline'));
  controller.failAfter = true;
  await assert.rejects(cloud.save(data('committed but reply lost')), { code: 'NETWORK' });
  assert.equal(cloud.getStatus().state, 'offline');
  assert.equal(cloud.getStatus().pending, true);
  assert.equal(controller.rows.get(USER_A).version, 2);
  await cloud.retry();
  assert.equal(cloud.getStatus().state, 'saved');
  assert.equal(cloud.getStatus().version, 2);
  assert.equal(controller.rows.get(USER_A).version, 2);
  assert.equal(cloud.exportPending(), null);
});

test('editing again after a lost response preserves write lineage and saves the newest work', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client);
  await cloud.load(); await cloud.save(data('baseline'));
  controller.failAfter = true;
  await assert.rejects(cloud.save(data('first edit committed')), { code: 'NETWORK' });
  await cloud.save(data('second edit after the network error'));
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'second edit after the network error');
  assert.equal(controller.rows.get(USER_A).version, 3);
  assert.equal(cloud.getStatus().state, 'saved');
  assert.equal(cloud.exportPending(), null);
});

test('offline newer edits keep both the newest recovery snapshot and the unacknowledged write lineage', async () => {
  const storage = memoryStorage();
  const { client, controller } = mockClient();
  const cloud = workspace(client, { storage });
  await cloud.load(); await cloud.save(data('baseline'));
  controller.failAfter = true;
  await assert.rejects(cloud.save(data('committed old edit')), { code: 'NETWORK' });
  controller.failBefore = true;
  await assert.rejects(cloud.save(data('newest offline edit')), { code: 'NETWORK' });
  assert.equal(cloud.exportPending().note, 'newest offline edit');
  cloud.dispose();
  const reloaded = workspace(client, { storage });
  const recovered = await reloaded.load();
  assert.equal(recovered.conflict, false);
  assert.equal(recovered.snapshot.note, 'newest offline edit');
  await reloaded.retry();
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'newest offline edit');
  assert.equal(controller.rows.get(USER_A).version, 3);
});

test('pending changes survive reload in the same tester session and stay isolated from another account', async () => {
  const storage = memoryStorage();
  const { client, controller } = mockClient();
  const first = workspace(client, { storage });
  await first.load(); await first.save(data('baseline'));
  controller.failBefore = true;
  await assert.rejects(first.save(data('offline changes')), { code: 'NETWORK' });
  first.dispose();
  const reloaded = workspace(client, { storage });
  const recovered = await reloaded.load();
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.snapshot.note, 'offline changes');
  assert.equal(reloaded.getStatus().pending, true);
  const other = mockClient({ rows: controller.rows, userId: USER_B });
  assert.equal(await workspace(other.client, { storage }).load(), null);
  await reloaded.retry();
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'offline changes');
  assert.equal(storage.values.size, 0);
});

test('a newer cloud copy on reload keeps the recovery draft as an explicit conflict', async () => {
  const storage = memoryStorage();
  const first = mockClient();
  const cloud = workspace(first.client, { storage });
  await cloud.load(); await cloud.save(data('baseline'));
  first.controller.failBefore = true;
  await assert.rejects(cloud.save(data('local pending')), { code: 'NETWORK' });
  cloud.dispose();
  const second = mockClient({ rows: first.controller.rows });
  const other = workspace(second.client); await other.load(); await other.save(data('remote newer'));
  const reloaded = workspace(first.client, { storage });
  const recovered = await reloaded.load();
  assert.equal(recovered.conflict, true);
  assert.equal(recovered.snapshot.note, 'local pending');
  assert.equal(first.controller.rows.get(USER_A).snapshot.note, 'remote newer');
});

test('rapid edits queue behind an in-flight save and finish with the latest snapshot', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client); await cloud.load();
  let release; controller.hold = new Promise(resolve => { release = resolve; });
  const first = cloud.save(data('first edit'));
  await new Promise(resolve => setImmediate(resolve));
  const second = cloud.save(data('latest edit'));
  release(); await Promise.all([first, second]);
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'latest edit');
  assert.equal(controller.rows.get(USER_A).version, 2);
  assert.equal(cloud.getStatus().state, 'saved');
});

test('late responses after sign-out cannot restore or acknowledge the old account state', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client); await cloud.load();
  let release; controller.hold = new Promise(resolve => { release = resolve; });
  const saving = cloud.save(data('old account'));
  await new Promise(resolve => setImmediate(resolve));
  controller.signIn(null); release();
  await assert.rejects(saving, { code: 'AUTH_CHANGED' });
  assert.equal(cloud.getStatus().state, 'signed_out');
  assert.equal(cloud.getStatus().userId, null);
  assert.equal(cloud.getStatus().version, null);
});

test('every verified non-anonymous account can use its own workspace without an invite lookup', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client);
  await cloud.load(); await cloud.save(data('authorised'));
  assert.equal(controller.rows.get(USER_A).snapshot.note, 'authorised');
  assert.equal(controller.calls.every(call => call.table === 'tester_workspaces'), true);
  assert.equal(controller.calls.every(call => (call.filters.user_id || call.payload?.user_id) === USER_A), true);
});

test('an account change during the initial auth lookup never restores the previous tester state', async () => {
  const { client, controller } = mockClient();
  const cloud = workspace(client);
  let release; controller.holdAuth = new Promise(resolve => { release = resolve; });
  const loading = cloud.load();
  await new Promise(resolve => setImmediate(resolve));
  controller.signIn(USER_B); release();
  await assert.rejects(loading, { code: 'AUTH_CHANGED' });
  assert.equal(controller.calls.length, 0);
  assert.equal(cloud.getStatus().userId, null);
});

test('an account change during the initial snapshot read discards the stale response', async () => {
  const { client, controller } = mockClient();
  const seed = workspace(client); await seed.load(); await seed.save(data('A private data')); seed.dispose();
  const cloud = workspace(client);
  let release; controller.holdRead = new Promise(resolve => { release = resolve; });
  const loading = cloud.load();
  await new Promise(resolve => setImmediate(resolve));
  controller.signIn(USER_B); release();
  await assert.rejects(loading, { code: 'AUTH_CHANGED' });
  assert.equal(cloud.getStatus().userId, null);
  assert.equal(cloud.exportPending(), null);
  assert.equal(await cloud.load(), null);
  assert.equal(cloud.getStatus().userId, USER_B);
});
