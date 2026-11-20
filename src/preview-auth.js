/* Hosted test access and cloud-save lifecycle. Local integrations keep their existing path. */
(function attachPreview(root) {
  'use strict';
  const config = root.WATCHIFY_CONFIG;
  if (config?.mode !== 'zeit-preview') return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element = id => document.getElementById(id);
  let client, user, cloud, state, lastSaved = null, timer, interval, working = null, observedAccountId = null;
  let dirty = false, changedWhileSaving = false, stopped = false, loaded = false, reopening = false, locked = false;
  let captureError = null, currentStatus = { state: 'idle' };
  const busy = () => Boolean(state?.uploadBusy || state?.sell?.busy || state?.syncBusy);
  const differentAccount = () => Boolean(observedAccountId && observedAccountId !== user?.id);
  const sessionChanged = () => Object.assign(new Error('The signed-in account changed.'), { code: 'AUTH_CHANGED' });

  function stopForSessionChange() {
    if (stopped) return;
    stopped = true; clearTimeout(timer); clearInterval(interval);
    setTimeout(lockWorkspace, 0);
  }
  function assertCurrentWorkspace() {
    if (stopped) throw sessionChanged();
    const owner = cloud?.getStatus?.().userId;
    if (owner && owner !== user?.id) { stopForSessionChange(); throw sessionChanged(); }
  }
  function setWorkspaceInert(value) {
    for (const id of ['header', 'main', 'footer', 'compare-dock', 'preview-toolbar', 'preview-save-recovery']) {
      const node = element(id); if (node) node.inert = value;
    }
  }
  function updateLockExport() {
    const button = element('preview-lock-export'), notice = element('preview-lock-error');
    if (button) { button.hidden = differentAccount(); button.disabled = differentAccount(); }
    if (notice) notice.textContent = differentAccount() ? 'A different account is now signed in. Return to sign-in to open its workspace. The previous account’s local changes cannot be downloaded by this account.' : '';
  }

  function gate(body) {
    element('header').innerHTML = '<div class="container"><a class="preview-wordmark" href="/">watchify</a></div>';
    element('main').innerHTML = '<div class="preview-gate"><section class="preview-card">' + body + '</section></div>';
    element('footer').innerHTML = '';
  }
  function waiting(title, text) {
    gate('<span class="preview-kicker">Zeit preview</span><h1>' + esc(title) + '</h1><p role="status">' + esc(text) + '</p>');
  }
  function safeMessage(error, fallback) {
    if (error?.code === 'invalid_credentials') return 'The email or password is incorrect.';
    if (error?.code === 'email_not_confirmed') return 'This test account has not been activated. Ask João to activate your account.';
    if (error?.status === 429 || error?.code === 'over_request_rate_limit') return 'Too many attempts. Please wait a moment and try again.';
    return fallback;
  }
  async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort(); else init.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try { return await fetch(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timeout); init.signal?.removeEventListener('abort', abort); }
  }
  function loginForm() {
    gate('<span class="preview-kicker">Zeit preview · Watchify 6.4.1</span><h1>A closer look at Watchify.</h1><p>Sign in with your individual test account to explore the site and save your changes.</p><form id="preview-login" class="preview-form"><label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Password<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><p class="preview-error" id="preview-login-error" role="alert"></p><button class="btn primary full" type="submit">Enter Watchify</button></form><p class="preview-note">Ask João for your test account. Each person has a separate workspace. Orders, messages and payments use sample data; no purchases or payments are made.</p>');
    return new Promise(resolve => {
      const form = element('preview-login');
      form.addEventListener('submit', async event => {
        event.preventDefault(); event.stopPropagation();
        const button = form.querySelector('button');
        if (button.disabled || !form.reportValidity()) return;
        const data = new FormData(form);
        button.disabled = true; button.textContent = 'Signing in…'; element('preview-login-error').textContent = '';
        try {
          const result = await client.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
          if (result.error) throw result.error;
          const verified = await client.auth.getUser();
          if (verified.error || !verified.data?.user) throw verified.error || new Error('Missing user');
          form.reset(); resolve(verified.data.user);
        } catch (error) {
          element('preview-login-error').textContent = safeMessage(error, 'Sign-in could not be completed. Check your connection and try again.');
        } finally { button.disabled = false; button.textContent = 'Enter Watchify'; }
      });
    });
  }
  async function retryGate(title, text) {
    gate('<span class="preview-kicker">Zeit preview</span><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><button id="preview-retry-load" class="btn primary full">Try again</button>');
    await new Promise(resolve => element('preview-retry-load').addEventListener('click', resolve, { once: true }));
  }
  async function authenticate() {
    waiting('Opening your workspace.', 'Checking your sign-in…');
    if (!root.supabase?.createClient || !config.supabaseUrl || !config.supabasePublishableKey) {
      waiting('Setup is incomplete.', 'The test environment needs its account connection. Please contact João.');
      return false;
    }
    client = root.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: 'watchify-auth-' + new URL(config.supabaseUrl).hostname },
      global: { fetch: fetchWithTimeout }
    });
    while (!user) {
      const session = await client.auth.getSession();
      if (session.error) { await retryGate('Sign-in could not be checked.', 'Your saved work has not been changed. Check your connection and try again.'); continue; }
      if (!session.data.session) { user = await loginForm(); break; }
      const verified = await client.auth.getUser();
      if (verified.data?.user && !verified.error) user = verified.data.user;
      else if (verified.error?.status === 401 || verified.error?.status === 403 || verified.error?.name === 'AuthSessionMissingError') {
        await client.auth.signOut({ scope: 'local' }); user = await loginForm();
      } else await retryGate('Sign-in could not be checked.', 'Your saved work has not been changed. Check your connection and try again.');
    }
    observedAccountId = user.id;
    client.auth.onAuthStateChange((_event, session) => {
      observedAccountId = session?.user?.id || null;
      updateLockExport();
      if (stopped || !user) return;
      if (!session || session.user?.id !== user.id) stopForSessionChange();
    });
    return !stopped;
  }
  async function restoreWorkspace(target) {
    assertCurrentWorkspace();
    state = target;
    cloud = root.WatchifyCloudWorkspace.create({ client, onStatus: status => {
      currentStatus = status;
      if (status.state === 'signed_out' && loaded) stopForSessionChange();
      paintStatus();
    } });
    for (;;) {
      assertCurrentWorkspace();
      waiting('Opening your workspace.', 'Loading your saved changes…');
      try {
        const saved = await cloud.load();
        assertCurrentWorkspace();
        if (saved?.snapshot) {
          root.WatchifyWorkspaceSnapshot.restore(state, saved.snapshot);
          lastSaved = saved.recovered ? null : JSON.stringify(saved.snapshot);
          dirty = Boolean(saved.recovered);
        }
        return;
      } catch (error) {
        if (stopped || error?.code === 'AUTH_CHANGED') { stopForSessionChange(); throw sessionChanged(); }
        await retryGate('Your workspace could not be loaded.', 'Your cloud data has not been replaced. Check your connection or ask João to check your test account, then try again.');
      }
    }
  }
  function statusName() {
    if (captureError) return 'Changes not saved';
    const s = currentStatus.state || currentStatus.status;
    if (stopped || s === 'signed_out') return 'Sign-in required';
    if (s === 'conflict') return 'Another session saved changes';
    if (s === 'error' || s === 'failed' || s === 'offline') return 'Changes not saved';
    if (working || s === 'saving') return 'Saving changes…';
    if (busy()) return 'Preparing changes…';
    if (dirty || currentStatus.pending || s === 'pending') return 'Changes waiting to save';
    return lastSaved ? 'Saved to your workspace' : 'Preparing your workspace…';
  }
  function paintStatus() {
    const label = element('preview-save-status');
    if (!label) return;
    const s = captureError ? 'error' : currentStatus.state || currentStatus.status || 'idle';
    label.textContent = statusName(); label.dataset.state = s;
    const failed = Boolean(captureError) || ['error', 'failed', 'offline', 'signed_out', 'conflict'].includes(s);
    const recovery = element('preview-save-recovery');
    recovery.hidden = !failed;
    element('preview-save-error').textContent = captureError?.message || (s === 'conflict'
      ? 'Your cloud workspace changed in another tab or device. Download your unsaved changes before reopening the saved workspace.'
      : 'Your changes are still in this tab. Check your connection, then retry. Keep this tab open until saving finishes.');
    element('preview-retry-save').hidden = s === 'conflict' || stopped || s === 'signed_out';
    element('preview-reload-saved').hidden = s !== 'conflict';
  }
  async function flush() {
    if (stopped || reopening || !loaded) return false;
    clearTimeout(timer);
    if (working) { changedWhileSaving = true; await working; return flush(); }
    if (busy()) { dirty = true; timer = setTimeout(flush, 650); paintStatus(); return false; }
    working = (async () => {
      try {
        const snapshot = await root.WatchifyWorkspaceSnapshot.capture(state);
        const fingerprint = JSON.stringify(snapshot);
        if (stopped) return false;
        if (fingerprint === lastSaved && !currentStatus.pending) { dirty = changedWhileSaving; captureError = null; return !dirty; }
        dirty = true; captureError = null; paintStatus();
        const pending = cloud.exportPending();
        // Identical requests keep their save id. New edits are staged locally before
        // the cloud adapter reconciles any earlier write with a lost response.
        if (pending && JSON.stringify(pending) === fingerprint) await cloud.retry();
        else await cloud.save(snapshot);
        if (stopped) return false;
        lastSaved = fingerprint; dirty = changedWhileSaving;
        return true;
      } catch (error) {
        dirty = true;
        if (!['error', 'failed', 'offline', 'signed_out', 'conflict'].includes(currentStatus.state || currentStatus.status)) {
          captureError = { message: error?.code === 'SNAPSHOT_TOO_LARGE' ? 'This workspace is too large to save. Remove some uploaded images and retry. Your changes remain in this tab.' : 'These changes could not be prepared for saving. Keep this tab open, download a copy, and contact João.' };
        }
        return false;
      }
    })();
    paintStatus();
    let success;
    try { success = await working; }
    finally {
      working = null; paintStatus();
      if (changedWhileSaving) { changedWhileSaving = false; schedule(); }
    }
    return success;
  }
  function schedule(event) {
    if (stopped || reopening || !loaded || event?.target?.closest?.('.preview-toolbar, .preview-recovery, .preview-lock')) return;
    dirty = true;
    if (working) changedWhileSaving = true;
    clearTimeout(timer); timer = setTimeout(flush, 650); paintStatus();
  }
  async function exportChanges() {
    if (differentAccount()) { updateLockExport(); return false; }
    let snapshot;
    try {
      const capture = root.WatchifyWorkspaceSnapshot.captureBackup || root.WatchifyWorkspaceSnapshot.capture;
      snapshot = await capture(state);
    } catch (_) {
      captureError = { message: 'The latest changes could not be downloaded. Keep this tab open, reduce oversized photos if needed, and try again. No older copy has been substituted.' };
      paintStatus(); return false;
    }
    if (!snapshot || differentAccount()) { updateLockExport(); return false; }
    const blob = new Blob([JSON.stringify({ product: 'Watchify', kind: 'test-workspace-backup', exportedAt: new Date().toISOString(), snapshot }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'watchify-test-workspace.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }
  async function reopenSaved() {
    if (stopped || reopening) return;
    if (busy()) { captureError = { message: 'Please wait for the current upload or action to finish before reopening the saved workspace.' }; paintStatus(); return; }
    reopening = true; clearTimeout(timer); setWorkspaceInert(true);
    try {
      if (working) await working;
      if (!await exportChanges()) return;
      if (!root.confirm('A backup download has been started. Confirm it was saved before continuing. Replace the changes in this tab with the saved cloud workspace?')) return;
      assertCurrentWorkspace();
      await cloud.load({ discardPending: true });
      assertCurrentWorkspace();
      dirty = false; stopped = true; loaded = false; clearInterval(interval); cloud.dispose?.();
      location.reload();
    } catch (_) {
      captureError = { message: 'The saved workspace could not be reopened. Your current changes are still in this tab. Check your connection and try again.' }; paintStatus();
    } finally {
      reopening = false;
      if (!stopped) { setWorkspaceInert(false); paintStatus(); }
    }
  }
  function lockWorkspace() {
    if (locked) return;
    locked = true;
    setWorkspaceInert(true);
    const modal = element('modal'); if (modal?.open) modal.close();
    const overlay = document.createElement('section'); overlay.className = 'preview-lock'; overlay.setAttribute('role', 'alertdialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'preview-lock-title');
    overlay.innerHTML = '<div class="preview-card"><span class="preview-kicker">Session changed</span><h1 id="preview-lock-title">Sign in again.</h1><p>Saving has stopped because your account session changed. You can download the changes in this tab before reopening Watchify, provided a different account is not signed in.</p><p class="preview-error" id="preview-lock-error" role="alert"></p><div class="preview-form"><button class="btn primary" id="preview-lock-export">Download changes</button><button class="btn outline" id="preview-lock-reload">Return to sign-in</button></div></div>';
    document.body.appendChild(overlay);
    element('preview-lock-export').addEventListener('click', exportChanges);
    element('preview-lock-reload').addEventListener('click', () => location.reload());
    updateLockExport();
    element(differentAccount() ? 'preview-lock-reload' : 'preview-lock-export').focus();
  }
  async function signOut() {
    const button = element('preview-signout'); button.disabled = true;
    if (busy()) { captureError = { message: 'Please wait for the current upload or action to finish, then sign out again.' }; paintStatus(); button.disabled = false; return; }
    setWorkspaceInert(true);
    try {
      if (!await flush() || dirty) { paintStatus(); return; }
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) { captureError = { message: 'Sign-out could not be completed. Please try again.' }; paintStatus(); return; }
      stopped = true; dirty = false; clearTimeout(timer); clearInterval(interval); location.reload();
    } finally { button.disabled = false; if (!stopped) setWorkspaceInert(false); }
  }
  function startSync() {
    assertCurrentWorkspace();
    const bar = document.createElement('aside'); bar.id = 'preview-toolbar'; bar.className = 'preview-toolbar'; bar.setAttribute('aria-label', 'Test workspace');
    bar.innerHTML = '<div class="preview-toolbar-copy"><strong>ZEIT TEST</strong><span>Sample orders and messages · no real payments</span></div><div class="preview-toolbar-actions"><span id="preview-save-status" class="preview-status" role="status"></span><button id="preview-signout" type="button">Sign out</button></div>';
    document.body.insertBefore(bar, element('header'));
    const recovery = document.createElement('aside'); recovery.id = 'preview-save-recovery'; recovery.className = 'preview-recovery'; recovery.hidden = true;
    recovery.innerHTML = '<p id="preview-save-error" role="alert"></p><button id="preview-retry-save">Retry saving</button><button id="preview-download-changes">Download changes</button><button id="preview-reload-saved" hidden>Reopen saved workspace</button>';
    bar.after(recovery);
    element('preview-signout').addEventListener('click', signOut);
    element('preview-download-changes').addEventListener('click', exportChanges);
    element('preview-reload-saved').addEventListener('click', reopenSaved);
    element('preview-retry-save').addEventListener('click', flush);
    for (const event of ['click', 'input', 'change', 'submit', 'drop']) document.addEventListener(event, schedule);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) void flush(); });
    window.addEventListener('beforeunload', event => { if (dirty || working) { event.preventDefault(); event.returnValue = ''; } });
    loaded = true; interval = setInterval(() => { if (!document.hidden && !working && !stopped) void flush(); }, 6000); schedule();
  }
  function securityPage() {
    return '<div class="preview-security"><a href="#account" class="text-link">Back to My Watchify</a><h1>Your test account.</h1><p class="preview-help">Your sign-in and saved workspace are connected. Each tester has their own account.</p><section><dl><div><dt>Signed in as</dt><dd class="preview-account-email">' + esc(user?.email) + '</dd></div><div><dt>Saved changes</dt><dd>Private to this account</dd></div><div><dt>Password and access</dt><dd>Managed by the test administrator</dd></div></dl><p class="preview-help">Ask João if you need a new password. Self-service password changes and MFA setup are not available in this test release.</p></section><p class="preview-help">The marketplace uses sample listings, messages and orders. Uploaded test data is saved to your workspace. Please use sample information during testing.</p></div>';
  }
  function fatal() { waiting('Watchify could not be opened.', 'Your saved cloud workspace has not been replaced. Reload this page or ask João to check the test environment.'); }
  root.WatchifyPreview = Object.freeze({ authenticate, restoreWorkspace, startSync, securityPage, fatal });
})(globalThis);
