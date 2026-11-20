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
  let nextTimer = 0, currentUser = options.initialUser === undefined ? USER_A : options.initialUser, signupSession = null, reloads = 0, confirmations = 0, captureCalls = 0;
  const authCalls = [], clientOptions = [], historyChanges = [];
  const unescape = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.listeners = new Map(); this.dataset = {}; this.hidden = false; this.inert = false; this.disabled = false; this.textContent = ''; this.value = ''; this.children = []; this.fields = []; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      for (const child of this.children) if (nodes.get(child.id) === child) nodes.delete(child.id);
      this.children = []; this._html = value;
      let form;
      for (const match of value.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const child = new Element(match[1]); child.id = match[3]; this.children.push(child);
        const fieldValue = match[2].match(/\bvalue="([^"]*)"/); child.value = fieldValue ? unescape(fieldValue[1]) : '';
        child.required = /\brequired\b/.test(match[2]);
        const following = value.slice(match.index + match[0].length), end = following.indexOf('</' + match[1] + '>');
        if (end !== -1) child.textContent = unescape(following.slice(0, end).replace(/<[^>]*>/g, ''));
        if (child.tagName === 'form') form = child;
        if (child.tagName === 'input' && form) form.fields.push(child);
      }
    }
    get innerHTML() { return this._html || ''; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    async emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) await fn({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
    reportValidity() { return this.fields.every(field => !field.required || field.value); }
    reset() { for (const field of this.fields) field.value = ''; }
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
  const sessionFor = account => account ? { user: account, access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token' } : null;
  const signedIn = result => { if (!result.error && result.data?.session) switchUser(result.data.session.user); return result; };
  const client = { auth: {
    getSession: async () => ({ data: { session: sessionFor(currentUser) }, error: null }),
    getUser: async () => options.getUser ? options.getUser(currentUser) : { data: { user: currentUser }, error: null },
    onAuthStateChange(fn) { authListeners.add(fn); return { data: { subscription: { unsubscribe() { authListeners.delete(fn); } } } }; },
    async signOut() { if (options.signOut) return options.signOut(); switchUser(null); return { error: null }; },
    async signInWithPassword(args) { authCalls.push({ method: 'signIn', args: copy(args) }); return signedIn(options.signIn ? await options.signIn(args) : { data: { user: USER_A, session: sessionFor(USER_A) }, error: null }); },
    async signUp() { throw new Error('Autoconfirm signup must not use the PKCE client.'); },
    async setSession() { authCalls.push({ method: 'adoptSignupSession', accountId: signupSession?.user?.id }); return signedIn(options.adoptSession ? await options.adoptSession() : { data: { user: signupSession?.user, session: signupSession }, error: null }); },
    async resetPasswordForEmail(email, args) { authCalls.push({ method: 'reset', email, args: copy(args) }); return options.reset ? options.reset(email, args) : { data: {}, error: null }; },
    async exchangeCodeForSession(code) { authCalls.push({ method: 'exchange', code }); return signedIn(options.exchange ? await options.exchange(code) : { data: { user: USER_A, session: sessionFor(USER_A), redirectType: null }, error: null }); },
    async updateUser() { throw new Error('Password changes must use the recovery-bound client.'); }
  } };
  const makeSignupClient = () => ({ auth: {
    async signUp(args) {
      authCalls.push({ method: 'signUp', args: copy(args) });
      const result = options.signUp ? await options.signUp(args) : { data: { user: USER_A, session: null }, error: null };
      signupSession = result.data?.session || null;
      return result;
    }
  } });
  const makeRecoveryClient = () => {
    const account = currentUser;
    return { auth: {
      async setSession() { authCalls.push({ method: 'recoverySession', accountId: account?.id }); return { data: { user: account, session: sessionFor(account) }, error: null }; },
      async getUser() { return { data: { user: account }, error: null }; },
      async updateUser(args) { authCalls.push({ method: 'updatePassword', accountId: account?.id }); return options.updatePassword ? options.updatePassword(args, account) : { data: { user: account }, error: null }; }
    } };
  };
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
  const location = new BrowserURL(options.url || 'https://watchify.example/');
  location.reload = () => { reloads++; };
  const context = {
    WATCHIFY_CONFIG: { mode: 'zeit-preview', supabaseUrl: 'https://watchifytestproject.supabase.co', supabasePublishableKey: 'sb_publishable_fixture_only' },
    supabase: { createClient: (_url, _key, settings) => { clientOptions.push(copy(settings.auth)); return settings.auth.persistSession ? client : settings.auth.flowType === 'implicit' ? makeSignupClient() : makeRecoveryClient(); } },
    WatchifyCloudWorkspace: { create({ onStatus }) { cloud.onStatus = onStatus; return cloud; } },
    WatchifyWorkspaceSnapshot: {
      async capture(state) { captureCalls++; return options.capture ? options.capture(state) : { note: state.note }; },
      async captureBackup(state) { return options.backup ? options.backup(state) : { note: state.note }; },
      restore(state, snapshot) { Object.assign(state, copy(snapshot)); }
    },
    document, Blob, URL: BrowserURL, URLSearchParams, AbortController, location,
    history: { replaceState(_state, _unused, url) { historyChanges.push(url); location.href = new BrowserURL(url, location.href).href; } },
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
    api: context.WatchifyPreview, nodes, cloud, downloads, switchUser, authCalls, clientOptions, location, historyChanges,
    get reloads() { return reloads; }, get confirmations() { return confirmations; }, get captureCalls() { return captureCalls; },
    async runTimer(ms) { const entry = [...timers.entries()].find(([, timer]) => timer.ms === ms); assert.ok(entry, `Expected a ${ms}ms timer`); timers.delete(entry[0]); return entry[1].fn(); },
    async emit(type) { for (const fn of listeners.get(type) || []) await fn({ target: new Element() }); },
    beforeUnload() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of windowListeners.get('beforeunload') || []) fn(event); return event; }
  };
}

async function open(h, state = { note: 'default seed' }) { assert.equal(await h.api.authenticate(), true); await h.api.restoreWorkspace(state); h.api.startSync(); return state; }

async function submitAuth(h, { email = USER_A.email, password = 'fixture password only', confirm = password } = {}) {
  h.nodes.get('preview-auth-email').value = email;
  if (h.nodes.has('preview-auth-password')) h.nodes.get('preview-auth-password').value = password;
  if (h.nodes.has('preview-auth-confirm')) h.nodes.get('preview-auth-confirm').value = confirm;
  await h.nodes.get('preview-login').emit('submit'); await settle();
}
const fixtureSession = account => ({ user: account, access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token' });
async function waitForNode(h, id) { for (let i = 0; i < 20 && !h.nodes.has(id); i++) await settle(); assert.ok(h.nodes.has(id), 'Expected UI element ' + id); }

test('signup without a session explains the backend mismatch and never opens a workspace', async () => {
  const h = setup({ initialUser: null });
  let authenticated = false;
  const opening = h.api.authenticate().then(value => { authenticated = value; return value; }); await settle();
  await h.nodes.get('preview-create-account').emit('click');
  await submitAuth(h);
  assert.equal(h.authCalls[0].method, 'signUp');
  assert.equal(h.authCalls[0].args.options, undefined);
  assert.match(h.nodes.get('preview-auth-message').textContent, /Sign-up did not open a session/);
  assert.match(h.nodes.get('preview-auth-message').textContent, /server may still require email confirmation/);
  assert.equal(h.nodes.has('preview-auth-confirm'), false);
  assert.equal(h.nodes.has('preview-resend-confirmation'), false);
  assert.equal(h.authCalls.some(call => call.method === 'adoptSignupSession'), false);
  assert.equal(authenticated, false);
  assert.equal(h.cloud.loads.length, 0);
  await submitAuth(h); assert.equal(await opening, true);
});

test('immediate signup uses a non-PKCE client and opens only a session verified with getUser', async () => {
  let checked = 0;
  const h = setup({ initialUser: null, signUp: async () => ({ data: { session: fixtureSession(USER_A), user: USER_A }, error: null }), getUser: async account => { checked++; return { data: { user: account }, error: null }; } });
  const opening = h.api.authenticate(); await settle();
  assert.equal(h.nodes.has('preview-resend-confirmation'), false);
  await h.nodes.get('preview-create-account').emit('click');
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /Confirm your email|Resend confirmation/);
  await submitAuth(h);
  assert.equal(await opening, true);
  assert.equal(checked, 1);
  assert.equal(h.clientOptions[0].flowType, 'pkce');
  assert.equal(h.clientOptions[1].flowType, 'implicit');
  assert.equal(h.clientOptions[1].persistSession, false);
  assert.equal(h.clientOptions[1].detectSessionInUrl, false);
  assert.notEqual(h.clientOptions[1].storageKey, h.clientOptions[0].storageKey);
  assert.equal(h.authCalls.find(call => call.method === 'adoptSignupSession').accountId, USER_A.id);
});

test('a signup session that cannot be verified does not open the account', async () => {
  const h = setup({ initialUser: null, signUp: async () => ({ data: { session: fixtureSession(USER_A), user: USER_A }, error: null }), getUser: async () => ({ data: { user: null }, error: { status: 401 } }) });
  let authenticated = false;
  void h.api.authenticate().then(result => { authenticated = result; }); await settle();
  await h.nodes.get('preview-create-account').emit('click'); await submitAuth(h);
  assert.equal(authenticated, false);
  assert.equal(h.cloud.loads.length, 0);
  assert.match(h.nodes.get('preview-login-error').textContent, /could not be completed/);
});

test('a concurrent sign-in prevents adopting a late signup session from another account', async () => {
  const pending = deferred();
  const h = setup({ initialUser: null, signUp: async () => { await pending.promise; return { data: { session: fixtureSession(USER_A), user: USER_A }, error: null }; } });
  void h.api.authenticate(); await settle();
  await h.nodes.get('preview-create-account').emit('click');
  const submitted = submitAuth(h); await settle();
  h.switchUser(USER_B); pending.resolve(); await submitted;
  assert.equal(h.authCalls.some(call => call.method === 'adoptSignupSession'), false);
  assert.match(h.nodes.get('preview-login-error').textContent, /account changed/);
  assert.equal(h.cloud.loads.length, 0);
});

test('signup rejects a mismatched or short password before making a request', async () => {
  const h = setup({ initialUser: null }); void h.api.authenticate(); await settle();
  await h.nodes.get('preview-create-account').emit('click');
  await submitAuth(h, { confirm: 'different fixture password' });
  assert.match(h.nodes.get('preview-login-error').textContent, /do not match/);
  await submitAuth(h, { password: 'short' });
  assert.match(h.nodes.get('preview-login-error').textContent, /at least 12/);
  assert.equal(h.authCalls.length, 0);
});

test('unexpected email requirements and rate limits remain signup errors', async t => {
  for (const [code, message] of [['email_address_not_authorized', /delivery is not available/], ['over_email_send_rate_limit', /sending limit/], ['signup_disabled', /registration is currently unavailable/]]) {
    await t.test(code, async () => {
      const h = setup({ initialUser: null, signUp: async () => ({ data: null, error: { code } }) });
      void h.api.authenticate(); await settle();
      await h.nodes.get('preview-create-account').emit('click'); await submitAuth(h);
      assert.match(h.nodes.get('preview-login-error').textContent, message);
      assert.equal(h.nodes.get('preview-auth-message').textContent, '');
      assert.equal(h.cloud.loads.length, 0);
    });
  }
});

test('a backend still requiring confirmation reports the setting without asking for email confirmation', async () => {
  const h = setup({ initialUser: null, signIn: async () => ({ data: null, error: { code: 'email_not_confirmed' } }) });
  void h.api.authenticate(); await settle(); await submitAuth(h);
  assert.match(h.nodes.get('preview-login-error').textContent, /server still requires email confirmation/);
  assert.equal(h.nodes.has('preview-resend-confirmation'), false);
  assert.doesNotMatch(h.nodes.get('preview-login-error').textContent, /Confirm your email|Check your inbox/);
  assert.equal(h.cloud.loads.length, 0);
});

test('reset requests use a same-origin clean return URL and do not reveal account existence', async () => {
  const h = setup({ initialUser: null, url: 'https://watchify.example/index.html?returnTo=https://untrusted.example/#account' });
  void h.api.authenticate(); await settle();
  await h.nodes.get('preview-forgot-password').emit('click'); await submitAuth(h);
  const request = h.authCalls.find(call => call.method === 'reset');
  assert.equal(request.args.redirectTo, 'https://watchify.example/index.html');
  assert.match(h.nodes.get('preview-auth-message').textContent, /If an account exists/);
  assert.equal(h.cloud.loads.length, 0);
});

test('a confirmation callback exchanges PKCE code, verifies the user and removes callback parameters', async () => {
  const h = setup({ initialUser: null, url: 'https://watchify.example/?code=fixture-confirm-code&sb_flow_id=fixture-flow#account' });
  assert.equal(await h.api.authenticate(), true);
  assert.equal(h.authCalls[0].method, 'exchange');
  assert.equal(h.location.href, 'https://watchify.example/#account');
  assert.equal(h.clientOptions[0].flowType, 'pkce');
  assert.equal(h.clientOptions[0].detectSessionInUrl, false);
});

test('expired or unsupported links display only a safe error and scrub callback credentials', async () => {
  const h = setup({ initialUser: null, url: 'https://watchify.example/?error=access_denied&error_description=untrusted-provider-text#access_token=fixture-untrusted-token&refresh_token=fixture-refresh' });
  void h.api.authenticate(); await settle();
  assert.match(h.nodes.get('preview-auth-message').textContent, /could not finish sign-in/);
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /untrusted-provider|fixture-untrusted-token/);
  assert.equal(h.location.href, 'https://watchify.example/');
  assert.equal(h.authCalls.length, 0);
  assert.equal(h.cloud.loads.length, 0);
});

test('a URL claiming to be password recovery cannot authorize a password update', async () => {
  const h = setup({ url: 'https://watchify.example/?auth=reset&type=recovery' });
  assert.equal(await h.api.authenticate(), true);
  assert.equal(h.nodes.has('preview-reset-password'), false);
  assert.equal(h.authCalls.length, 0);
  assert.equal(h.clientOptions.length, 1);
});

test('verified recovery updates the link account with an isolated client and then asks for sign-in', async () => {
  const h = setup({ initialUser: null, url: 'https://watchify.example/?code=fixture-recovery-code', exchange: async () => ({ data: { user: USER_A, session: fixtureSession(USER_A), redirectType: 'recovery' }, error: null }) });
  let authenticated = false;
  const opening = h.api.authenticate().then(result => { authenticated = result; return result; }); await waitForNode(h, 'preview-new-password');
  h.nodes.get('preview-new-password').value = 'new fixture password';
  h.nodes.get('preview-confirm-password').value = 'new fixture password';
  await h.nodes.get('preview-reset-password').emit('submit'); await settle();
  assert.deepEqual(h.authCalls.find(call => call.method === 'updatePassword'), { method: 'updatePassword', accountId: USER_A.id });
  assert.equal(h.clientOptions[1].persistSession, false);
  assert.equal(h.clientOptions[1].autoRefreshToken, false);
  assert.match(h.nodes.get('preview-auth-message').textContent, /password has been updated/);
  assert.equal(authenticated, false);
  await submitAuth(h); assert.equal(await opening, true);
});

test('a different account signing in before password reset stops the update', async () => {
  const h = setup({ initialUser: null, url: 'https://watchify.example/?code=fixture-recovery-code', exchange: async () => ({ data: { user: USER_A, session: fixtureSession(USER_A), redirectType: 'recovery' }, error: null }) });
  void h.api.authenticate(); await waitForNode(h, 'preview-new-password');
  h.switchUser(USER_B);
  h.nodes.get('preview-new-password').value = 'new fixture password';
  h.nodes.get('preview-confirm-password').value = 'new fixture password';
  await h.nodes.get('preview-reset-password').emit('submit');
  assert.match(h.nodes.get('preview-reset-error').textContent, /account changed/);
  assert.equal(h.authCalls.some(call => call.method === 'updatePassword'), false);
});

test('a concurrent account change cannot retarget an in-flight password update', async () => {
  const updating = deferred();
  const h = setup({ initialUser: null, url: 'https://watchify.example/?code=fixture-recovery-code', exchange: async () => ({ data: { user: USER_A, session: fixtureSession(USER_A), redirectType: 'recovery' }, error: null }), updatePassword: async (_args, account) => { await updating.promise; return { data: { user: account }, error: null }; } });
  void h.api.authenticate(); await waitForNode(h, 'preview-new-password');
  h.nodes.get('preview-new-password').value = 'new fixture password';
  h.nodes.get('preview-confirm-password').value = 'new fixture password';
  const submitted = h.nodes.get('preview-reset-password').emit('submit'); await settle();
  h.switchUser(USER_B); updating.resolve(); await submitted; await settle();
  assert.deepEqual(h.authCalls.find(call => call.method === 'updatePassword'), { method: 'updatePassword', accountId: USER_A.id });
  assert.match(h.nodes.get('preview-auth-message').textContent, /Sign in with your new password/);
  assert.equal(h.cloud.loads.length, 0);
});

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
