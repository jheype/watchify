'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const USER_A = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test' };
const USER_B = { id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test' };
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function setup(options = {}) {
  const nodes = new Map(), timers = new Map(), intervals = new Map(), downloads = [], urls = new Map();
  const listeners = new Map(), windowListeners = new Map(), authListeners = new Set();
  let nextTimer = 0, currentUser = USER_A, reloads = 0, confirmations = 0, captureCalls = 0;
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.listeners = new Map(); this.dataset = {}; this.hidden = false; this.inert = false; this.disabled = false; this.textContent = ''; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) { this._html = value; for (const match of value.matchAll(/\bid="([^"]+)"/g)) { const child = new Element(); child.id = match[1]; } }
    get innerHTML() { return this._html || ''; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    async emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) await fn({ target: this, ...event }); }
    closest() { return null; }
    setAttribute() {}
    insertBefore() {}
    appendChild() {}
    after() {}
    focus() {}
    close() { this.open = false; }
    click() { if (this.tagName === 'a') downloads.push({ name: this.download, blob: urls.get(this.href) }); else return this.emit('click'); }
  }
  for (const id of ['header', 'main', 'footer', 'compare-dock', 'modal']) { const node = new Element(); node.id = id; }
  const document = {
    body: new Element('body'), hidden: false, visibilityState: 'visible',
    getElementById: id => nodes.get(id) || null,
    createElement: tag => new Element(tag),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }
  };
  const client = { auth: {
    getSession: async () => ({ data: { session: currentUser ? { user: currentUser } : null }, error: null }),
    getUser: async () => ({ data: { user: currentUser }, error: null }),
    onAuthStateChange(fn) { authListeners.add(fn); return { data: { subscription: { unsubscribe() { authListeners.delete(fn); } } } }; },
    async signOut() { if (options.signOut) return options.signOut(); switchUser(null); return { error: null }; }
  } };
  function switchUser(next) { currentUser = next; for (const fn of authListeners) fn(next ? 'SIGNED_IN' : 'SIGNED_OUT', next ? { user: next } : null); }
  const cloud = {
    pending: copy(options.pending || null), remote: copy(options.remote || null), status: { state: 'idle', userId: USER_A.id, pending: false },
    loads: [], saves: [], retries: [], operations: [], disposed: false,
    emit(state, error = null) { this.status = { state, userId: USER_A.id, pending: !!this.pending, error }; this.onStatus(copy(this.status)); },
    async load(args = {}) {
      this.loads.push(copy(args));
      if (options.load) return options.load(this, args);
      if (args.discardPending) { this.pending = null; this.emit('saved'); return { snapshot: copy(this.remote), recovered: false }; }
      this.emit(options.conflict ? 'conflict' : this.pending ? 'pending' : this.remote ? 'saved' : 'ready');
      const snapshot = this.pending || this.remote;
      return snapshot ? { snapshot: copy(snapshot), recovered: !!this.pending, conflict: !!options.conflict } : null;
    },
    async save(snapshot) {
      this.saves.push(copy(snapshot)); this.operations.push('save:' + snapshot.note);
      this.pending = copy(snapshot); this.emit('saving');
      if (options.conflict) { this.emit('conflict'); throw Object.assign(new Error('Newer remote copy'), { code: 'CONFLICT' }); }
      if (options.save) return options.save(this, snapshot);
      this.remote = copy(snapshot); this.pending = null; this.emit('saved');
    },
    async retry() {
      this.retries.push(copy(this.pending)); this.operations.push('retry:' + this.pending?.note);
      if (options.retry) return options.retry(this);
      this.remote = copy(this.pending); this.pending = null; this.emit('saved');
    },
    exportPending() { return copy(this.pending); },
    getStatus() { return copy(this.status); },
    dispose() { this.disposed = true; }
  };
  class BrowserURL extends URL {}
  BrowserURL.createObjectURL = blob => { const url = 'blob:test/' + urls.size; urls.set(url, blob); return url; };
  BrowserURL.revokeObjectURL = url => urls.delete(url);
  const context = {
    WATCHIFY_CONFIG: { mode: 'zeit-preview', supabaseUrl: 'https://watchifytestproject.supabase.co', supabasePublishableKey: 'sb_publishable_fixture_only' },
    supabase: { createClient: () => client },
    WatchifyCloudWorkspace: { create({ onStatus }) { cloud.onStatus = onStatus; return cloud; } },
    WatchifyWorkspaceSnapshot: {
      async capture(state) { captureCalls++; return options.capture ? options.capture(state) : { note: state.note }; },
      async captureBackup(state) { return options.backup ? options.backup(state) : { note: state.note }; },
      restore(state, snapshot) { Object.assign(state, copy(snapshot)); }
    },
    document, Blob, URL: BrowserURL, AbortController,
    location: { reload() { reloads++; } },
    confirm() { confirmations++; return options.confirm !== false; },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = ++nextTimer; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preview-auth.js'), 'utf8'), context);
  return {
    api: context.WatchifyPreview, nodes, cloud, downloads, switchUser,
    get reloads() { return reloads; }, get confirmations() { return confirmations; }, get captureCalls() { return captureCalls; },
    async runTimer(ms) { const entry = [...timers.entries()].find(([, timer]) => timer.ms === ms); assert.ok(entry, `Expected a ${ms}ms timer`); timers.delete(entry[0]); return entry[1].fn(); },
    async emit(type) { for (const fn of listeners.get(type) || []) await fn({ target: new Element() }); },
    beforeUnload() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of windowListeners.get('beforeunload') || []) fn(event); return event; }
  };
}

async function open(h, state = { note: 'default seed' }) { assert.equal(await h.api.authenticate(), true); await h.api.restoreWorkspace(state); h.api.startSync(); return state; }

test('a recovered local draft is retried before it can be reported as saved', async () => {
  const h = setup({ remote: { note: 'old remote' }, pending: { note: 'recovered edit' } });
  const state = await open(h);
  assert.equal(state.note, 'recovered edit');
  assert.equal(h.nodes.get('preview-save-status').textContent, 'Changes waiting to save');
  await h.runTimer(650);
  assert.deepEqual(h.cloud.operations, ['retry:recovered edit']);
  assert.equal(h.nodes.get('preview-save-status').textContent, 'Saved to your workspace');
});

test('an unchanged save with a lost response is retried with its existing request', async () => {
  let first = true;
  const h = setup({ remote: { note: 'baseline' }, save: async (cloud, snapshot) => {
    cloud.remote = copy(snapshot);
    if (first) { first = false; cloud.emit('offline'); throw Object.assign(new Error('Response lost'), { code: 'NETWORK' }); }
    cloud.pending = null; cloud.emit('saved');
  } });
  const state = await open(h); state.note = 'first edit';
  await h.runTimer(650);
  assert.equal(h.nodes.get('preview-save-status').textContent, 'Changes not saved');
  assert.equal(h.nodes.get('preview-save-recovery').hidden, false);
  await h.nodes.get('preview-retry-save').emit('click');
  assert.deepEqual(h.cloud.operations, ['save:first edit', 'retry:first edit']);
  assert.equal(h.cloud.remote.note, 'first edit');
  assert.equal(h.nodes.get('preview-save-status').textContent, 'Saved to your workspace');
});

test('newer edits replace the recoverable draft before another network attempt while offline', async () => {
  const h = setup({ remote: { note: 'baseline' }, save: async cloud => {
    cloud.emit('offline'); throw Object.assign(new Error('Offline'), { code: 'NETWORK' });
  } });
  const state = await open(h); state.note = 'first offline edit';
  await h.runTimer(650);
  state.note = 'latest offline edit'; await h.emit('input'); await h.runTimer(650);
  assert.deepEqual(h.cloud.operations, ['save:first offline edit', 'save:latest offline edit']);
  assert.equal(h.cloud.exportPending().note, 'latest offline edit');
  assert.equal(h.beforeUnload().prevented, true);
  assert.equal(h.nodes.get('preview-save-status').textContent, 'Changes not saved');
});

test('reopening a conflict downloads the latest state and explicitly clears pending recovery before reload', async () => {
  const h = setup({ remote: { note: 'new remote' }, pending: { note: 'old local' }, conflict: true });
  const state = await open(h); state.note = 'latest local edit';
  await h.nodes.get('preview-reload-saved').emit('click');
  assert.equal(h.downloads.length, 1);
  assert.equal(JSON.parse(await h.downloads[0].blob.text()).snapshot.note, 'latest local edit');
  assert.deepEqual(h.cloud.loads, [{}, { discardPending: true }]);
  assert.equal(h.cloud.pending, null);
  assert.equal(h.confirmations, 1);
  assert.equal(h.reloads, 1);
});

test('failed loading never seeds a replacement workspace and a retry restores the existing cloud state', async () => {
  let attempts = 0;
  const h = setup({ load: async cloud => {
    if (!attempts++) { cloud.emit('offline'); throw new Error('network unavailable'); }
    cloud.emit('saved'); return { snapshot: { note: 'existing cloud data' }, recovered: false };
  } });
  assert.equal(await h.api.authenticate(), true);
  const state = { note: 'default seed' };
  const restore = h.api.restoreWorkspace(state); await settle();
  assert.equal(state.note, 'default seed');
  assert.equal(h.cloud.saves.length, 0);
  await h.nodes.get('preview-retry-load').emit('click'); await restore;
  assert.equal(state.note, 'existing cloud data');
  assert.equal(h.cloud.saves.length, 0);
});

test('changing accounts during bootstrap cannot restore or save the previous account data', async () => {
  const loading = deferred();
  const h = setup({ load: async cloud => { await loading.promise; cloud.emit('saved'); return { snapshot: { note: 'A private data' } }; } });
  await h.api.authenticate();
  const state = { note: 'default seed' };
  const restore = h.api.restoreWorkspace(state); await settle();
  h.switchUser(USER_B); loading.resolve();
  await assert.rejects(restore, { code: 'AUTH_CHANGED' });
  assert.equal(state.note, 'default seed');
  assert.equal(h.cloud.saves.length, 0);
  assert.throws(() => h.api.startSync(), { code: 'AUTH_CHANGED' });
  await h.runTimer(0);
  assert.equal(h.nodes.get('main').inert, true);
});

test('changing accounts during asynchronous capture stops the pending save', async () => {
  const capturing = deferred();
  const h = setup({ remote: { note: 'baseline' }, capture: async state => { await capturing.promise; return { note: state.note }; } });
  const state = await open(h); state.note = 'A unsaved edit';
  const flushing = h.runTimer(650); await settle();
  h.switchUser(USER_B); capturing.resolve(); await flushing;
  assert.equal(h.cloud.saves.length, 0);
  await h.runTimer(0);
  assert.equal(h.nodes.get('main').inert, true);
});

test('a different signed-in account cannot export the previous account data, while expired sessions can keep a local backup', async () => {
  const h = setup({ remote: { note: 'A private data' } });
  await open(h);
  h.switchUser(USER_B); await h.runTimer(0);
  assert.equal(h.nodes.get('preview-lock-export').hidden, true);
  await h.nodes.get('preview-lock-export').emit('click');
  assert.equal(h.downloads.length, 0);
  h.switchUser(null);
  assert.equal(h.nodes.get('preview-lock-export').hidden, false);
  await h.nodes.get('preview-lock-export').emit('click');
  assert.equal(h.downloads.length, 1);
  assert.equal(JSON.parse(await h.downloads[0].blob.text()).snapshot.note, 'A private data');
  assert.equal(h.cloud.saves.length, 0);
});

test('an edit made during a save remains dirty and the following save contains the latest changes', async () => {
  const saving = deferred();
  let first = true;
  const h = setup({ remote: { note: 'baseline' }, save: async (cloud, snapshot) => {
    if (first) { first = false; await saving.promise; }
    cloud.remote = copy(snapshot); cloud.pending = null; cloud.emit('saved');
  } });
  const state = await open(h); state.note = 'first edit';
  const firstSave = h.runTimer(650); await settle();
  state.note = 'edit during save'; await h.emit('input');
  const nextSave = h.runTimer(650); await settle();
  saving.resolve(); await Promise.all([firstSave, nextSave]);
  assert.deepEqual(h.cloud.operations, ['save:first edit', 'save:edit during save']);
  assert.equal(h.cloud.remote.note, 'edit during save');
  assert.equal(h.beforeUnload().prevented, false);
});

test('unfinished uploads retain the unload warning and are saved only after completion', async () => {
  const h = setup({ remote: { note: 'baseline' } });
  const state = await open(h); state.uploadBusy = true;
  await h.runTimer(650);
  assert.equal(h.captureCalls, 0);
  assert.equal(h.beforeUnload().prevented, true);
  assert.equal(h.nodes.get('preview-save-status').textContent, 'Preparing changes…');
  state.uploadBusy = false; state.note = 'uploaded photos complete';
  await h.runTimer(650);
  assert.equal(h.cloud.remote.note, 'uploaded photos complete');
  assert.equal(h.beforeUnload().prevented, false);
});

test('backup export uses the latest state even when the cloud snapshot is too large', async () => {
  const h = setup({ remote: { note: 'older saved copy' }, capture: async () => { throw Object.assign(new Error('too large'), { code: 'SNAPSHOT_TOO_LARGE' }); } });
  const state = await open(h); state.note = 'latest large workspace';
  await h.runTimer(650);
  await h.nodes.get('preview-download-changes').emit('click');
  assert.equal(h.downloads.length, 1);
  assert.equal(JSON.parse(await h.downloads[0].blob.text()).snapshot.note, 'latest large workspace');
  assert.equal(h.cloud.saves.length, 0);
});

test('a failed backup never silently substitutes an older snapshot or discards current changes', async () => {
  const h = setup({ remote: { note: 'remote' }, pending: { note: 'older pending' }, conflict: true, backup: async () => { throw new Error('photo unavailable'); } });
  const state = await open(h); state.note = 'new unsaved changes';
  await h.nodes.get('preview-reload-saved').emit('click');
  assert.equal(h.downloads.length, 0);
  assert.equal(h.confirmations, 0);
  assert.equal(h.reloads, 0);
  assert.deepEqual(h.cloud.loads, [{}]);
  assert.equal(state.note, 'new unsaved changes');
  assert.match(h.nodes.get('preview-save-error').textContent, /No older copy has been substituted/);
  assert.equal(h.nodes.get('main').inert, false);
});
