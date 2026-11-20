/* Hosted account access and cloud-save lifecycle. Local integrations keep their existing path. */
(function attachPreview(root) {
  'use strict';
  const config = root.WATCHIFY_CONFIG;
  if (config?.mode !== 'zeit-preview') return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element = id => document.getElementById(id);
  let client, user, cloud, state, lastSaved = null, timer, interval, working = null, observedAccountId = null;
  let dirty = false, changedWhileSaving = false, stopped = false, loaded = false, reopening = false, locked = false;
  let captureError = null, currentStatus = { state: 'idle' };
  let authObserved = false;
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
    if (error?.code === 'email_not_confirmed') return 'The server still requires email confirmation for this account. Contact the site owner to finish enabling direct sign-in.';
    if (error?.code === 'email_address_not_authorized') return 'Email delivery is not available for this address yet. The site owner needs to finish setting up email delivery. Please try again later.';
    if (error?.code === 'over_email_send_rate_limit') return 'The email service has reached its sending limit. Wait before requesting another email.';
    if (error?.status === 429 || error?.code === 'over_request_rate_limit') return 'Too many attempts. Please wait a moment and try again.';
    if (error?.code === 'signup_disabled') return 'New account registration is currently unavailable. Please try again later.';
    if (error?.code === 'weak_password') return 'Choose a stronger password with at least 12 characters. Avoid common or reused passwords.';
    if (error?.code === 'same_password') return 'Choose a password different from your current password.';
    if (error?.code === 'email_address_invalid') return 'Enter a valid email address.';
    if (['user_already_exists', 'email_exists'].includes(error?.code)) return 'If you already have an account, sign in or reset your password.';
    if (error?.code === 'AUTH_CHANGED') return 'The signed-in account changed. Return to sign-in and try again.';
    if (error?.code === 'AUTH_REQUIRED') return 'Sign in with an email and password account to continue.';
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
  function authOptions(persistent = true) {
    return {
      auth: { persistSession: persistent, autoRefreshToken: persistent, detectSessionInUrl: false, flowType: 'pkce', storageKey: 'watchify-auth-' + new URL(config.supabaseUrl).hostname + (persistent ? '' : '-recovery') },
      global: { fetch: fetchWithTimeout }
    };
  }
  function emailReturnUrl() {
    const here = new URL(location.href);
    return here.origin + here.pathname;
  }
  async function verifiedUser(expectedId) {
    const result = await client.auth.getUser();
    if (result.error) throw result.error;
    const account = result.data?.user;
    if (!account?.id || account.is_anonymous) throw Object.assign(new Error('A signed-in account is required.'), { code: 'AUTH_REQUIRED' });
    if ((expectedId && account.id !== expectedId) || (authObserved && observedAccountId !== account.id)) throw sessionChanged();
    return account;
  }
  async function signUpWithPassword(email, password) {
    // Supabase does not support PKCE sign-up with email autoconfirm. Keep
    // recovery on PKCE, and adopt only a returned, real sign-up session.
    const options = authOptions(false);
    options.auth.flowType = 'implicit';
    options.auth.storageKey = 'watchify-auth-' + new URL(config.supabaseUrl).hostname + '-signup';
    const signupClient = root.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, options);
    const previousAccount = observedAccountId;
    const result = await signupClient.auth.signUp({ email, password });
    if (result.error || !result.data?.session) return result;
    if (authObserved && observedAccountId !== previousAccount) throw sessionChanged();
    const session = result.data.session;
    if (!session.user?.id || session.user.is_anonymous) throw Object.assign(new Error('Missing sign-up account'), { code: 'AUTH_REQUIRED' });
    const adopted = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (adopted.error) throw adopted.error;
    if (adopted.data?.session?.user?.id !== session.user.id) throw sessionChanged();
    return adopted;
  }
  function loginForm(notice = '') {
    return new Promise(resolve => {
      let rendering = 0;
      function render(mode = 'signin', email = '', message = '') {
        const version = ++rendering;
        const signup = mode === 'signup', password = signup || mode === 'signin';
        const titles = { signin: 'A closer look at Watchify.', signup: 'Create your Watchify account.', reset: 'Reset your password.' };
        const descriptions = { signin: 'Sign in to explore Watchify and save changes to your own workspace.', signup: 'Create your account with an email and password to start testing.', reset: 'Enter your email to request a password reset link.' };
        const actions = { signin: 'Enter Watchify', signup: 'Create account', reset: 'Request reset link' };
        const links = mode === 'signin' ? '<button id="preview-create-account" type="button">Create account</button><button id="preview-forgot-password" type="button">Forgot password?</button>' : '<button id="preview-back-signin" type="button">Back to sign in</button>';
        gate('<span class="preview-kicker">Watchify 6.4.3 · Preview</span><h1>' + titles[mode] + '</h1><p>' + descriptions[mode] + '</p><p class="preview-message" id="preview-auth-message" role="status">' + esc(message) + '</p><form id="preview-login" class="preview-form"><label>Email<input id="preview-auth-email" name="email" type="email" autocomplete="username" maxlength="254" value="' + esc(email) + '" required></label>' + (password ? '<label>Password<input id="preview-auth-password" name="password" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" ' + (signup ? 'minlength="12" ' : '') + 'maxlength="256" required></label>' : '') + (signup ? '<p class="preview-password-help">Use at least 12 characters.</p><label>Confirm password<input id="preview-auth-confirm" name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label>' : '') + '<p class="preview-error" id="preview-login-error" role="alert"></p><button id="preview-auth-submit" class="btn primary full" type="submit">' + actions[mode] + '</button></form><nav class="preview-auth-links" aria-label="Account access">' + links + '</nav><p class="preview-note">Each account has a separate workspace. Orders, messages and payments use sample data; no purchases or payments are made.</p>');
        const form = element('preview-login'), button = element('preview-auth-submit'), errorText = element('preview-login-error');
        const navigate = next => { if (!button.disabled) render(next, element('preview-auth-email').value.trim()); };
        element('preview-create-account')?.addEventListener('click', () => navigate('signup'));
        element('preview-forgot-password')?.addEventListener('click', () => navigate('reset'));
        element('preview-back-signin')?.addEventListener('click', () => navigate('signin'));
        form.addEventListener('submit', async event => {
          event.preventDefault(); event.stopPropagation();
          if (button.disabled || !form.reportValidity()) return;
          const address = element('preview-auth-email').value.trim();
          const secret = password ? element('preview-auth-password').value : '';
          errorText.textContent = '';
          if (signup && secret !== element('preview-auth-confirm').value) { errorText.textContent = 'The passwords do not match.'; return; }
          if (signup && secret.length < 12) { errorText.textContent = 'Use a password with at least 12 characters.'; return; }
          button.disabled = true; button.textContent = 'Please wait…';
          try {
            let result;
            if (mode === 'signin') result = await client.auth.signInWithPassword({ email: address, password: secret });
            else if (signup) result = await signUpWithPassword(address, secret);
            else result = await client.auth.resetPasswordForEmail(address, { redirectTo: emailReturnUrl() });
            if (result.error) throw result.error;
            if (mode === 'signin' || (signup && result.data?.session)) {
              if (!result.data?.session?.user?.id) throw Object.assign(new Error('Missing session'), { code: 'AUTH_REQUIRED' });
              const account = await verifiedUser(result.data.session.user.id);
              form.reset(); resolve(account); return;
            }
            // A user object without a session does not grant access. It can
            // also be an obfuscated response for an existing email address.
            const feedback = mode === 'reset'
              ? 'If an account exists for this email, a reset message has been requested. Check your inbox and spam folder. Open the newest link in this same browser.'
              : 'Sign-up did not open a session. The server may still require email confirmation, or this email may already have an account. Try signing in; if it fails, contact the site owner.';
            render('signin', address, feedback);
          } catch (error) {
            if (version === rendering) errorText.textContent = safeMessage(error, mode === 'signin' ? 'Sign-in could not be completed. Check your connection and try again.' : 'The request could not be completed. Check your connection and try again.');
          } finally { if (version === rendering) { button.disabled = false; button.textContent = actions[mode]; } }
        });
      }
      render('signin', '', notice);
    });
  }
  async function resetPasswordForm(session, account) {
    // Bind the update to the session in the recovery link. A different account
    // signing in in another tab must never become the updateUser target.
    const recoveryClient = root.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, authOptions(false));
    const seeded = await recoveryClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (seeded.error) throw seeded.error;
    const verified = await recoveryClient.auth.getUser();
    if (verified.error || verified.data?.user?.id !== account.id || verified.data.user.is_anonymous) throw verified.error || sessionChanged();
    gate('<span class="preview-kicker">Watchify account</span><h1>Choose a new password.</h1><p>Set a password with at least 12 characters for the account in your reset link.</p><form id="preview-reset-password" class="preview-form"><label>New password<input id="preview-new-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><label>Confirm new password<input id="preview-confirm-password" name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><p id="preview-reset-error" class="preview-error" role="alert"></p><button id="preview-reset-submit" class="btn primary full" type="submit">Save new password</button></form><nav class="preview-auth-links"><button id="preview-reset-cancel" type="button">Back to sign in</button></nav>');
    return new Promise(resolve => {
      const form = element('preview-reset-password'), button = element('preview-reset-submit'), cancel = element('preview-reset-cancel');
      cancel.addEventListener('click', () => { if (!button.disabled) { form.reset(); resolve('Sign in to continue. Your password has not been changed.'); } });
      form.addEventListener('submit', async event => {
        event.preventDefault(); event.stopPropagation();
        if (button.disabled || !form.reportValidity()) return;
        const password = element('preview-new-password').value;
        const errorText = element('preview-reset-error'); errorText.textContent = '';
        if (password.length < 12) { errorText.textContent = 'Use a password with at least 12 characters.'; return; }
        if (password !== element('preview-confirm-password').value) { errorText.textContent = 'The passwords do not match.'; return; }
        if (authObserved && observedAccountId !== account.id) { errorText.textContent = safeMessage(sessionChanged()); return; }
        button.disabled = true; cancel.disabled = true; button.textContent = 'Saving password…';
        try {
          const result = await recoveryClient.auth.updateUser({ password });
          if (result.error) throw result.error;
          if (result.data?.user?.id !== account.id) throw sessionChanged();
          form.reset(); resolve('Your password has been updated. Sign in with your new password to continue.');
        } catch (error) { errorText.textContent = safeMessage(error, 'The password could not be updated. Try again or request a new reset link.'); }
        finally { button.disabled = false; cancel.disabled = false; button.textContent = 'Save new password'; }
      });
    });
  }
  async function emailCallback() {
    const url = new URL(location.href), fragment = new URLSearchParams(url.hash.slice(1));
    const code = url.searchParams.get('code');
    const hasError = url.searchParams.has('error') || fragment.has('error');
    const hasTokens = fragment.has('access_token') || fragment.has('refresh_token');
    if (!code && !hasError && !hasTokens) return null;
    const cleanUrl = () => {
      for (const key of ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'access_token', 'refresh_token']) url.searchParams.delete(key);
      if (hasError || hasTokens) url.hash = '';
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    };
    try {
      if (!code || hasError || hasTokens) throw new Error('Unsupported or expired email link');
      const result = await client.auth.exchangeCodeForSession(code);
      if (result.error) throw result.error;
      if (!result.data?.session?.user?.id) throw new Error('Missing callback session');
      cleanUrl();
      const account = await verifiedUser(result.data.session.user.id);
      if (result.data.redirectType === 'recovery') return { notice: await resetPasswordForm(result.data.session, account) };
      return { account };
    } catch (_) {
      return { notice: 'This email link could not finish sign-in. It may have expired or been opened in a different browser. Try signing in; if needed, request a new password reset link in this browser.' };
    } finally { cleanUrl(); }
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
    client = root.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, authOptions());
    client.auth.onAuthStateChange((_event, session) => {
      authObserved = true;
      observedAccountId = session?.user?.id || null;
      updateLockExport();
      if (stopped || !user) return;
      if (!session || session.user?.is_anonymous || session.user?.id !== user.id) stopForSessionChange();
    });
    const callback = await emailCallback();
    if (callback?.account) user = callback.account;
    else if (callback?.notice) user = await loginForm(callback.notice);
    while (!user) {
      const session = await client.auth.getSession();
      if (session.error) { await retryGate('Sign-in could not be checked.', 'Your saved work has not been changed. Check your connection and try again.'); continue; }
      if (!session.data.session || session.data.session.user?.is_anonymous) { user = await loginForm(); break; }
      try { user = await verifiedUser(session.data.session.user?.id); }
      catch (error) {
        if (error?.status === 401 || error?.status === 403 || error?.name === 'AuthSessionMissingError' || ['AUTH_REQUIRED', 'AUTH_CHANGED'].includes(error?.code)) user = await loginForm(safeMessage(error, 'Sign in again to continue.'));
        else await retryGate('Sign-in could not be checked.', 'Your saved work has not been changed. Check your connection and try again.');
      }
    }
    if (authObserved && observedAccountId !== user.id) stopForSessionChange();
    else observedAccountId = user.id;
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
        await retryGate('Your workspace could not be loaded.', 'Your cloud data has not been replaced. Check your connection, then try again.');
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
    return '<div class="preview-security"><a href="#account" class="text-link">Back to My Watchify</a><h1>Your account.</h1><p class="preview-help">Your sign-in and saved workspace are connected. Each account has its own workspace.</p><section><dl><div><dt>Signed in as</dt><dd class="preview-account-email">' + esc(user?.email) + '</dd></div><div><dt>Saved changes</dt><dd>Private to this account</dd></div><div><dt>Password recovery</dt><dd>Available from the sign-in screen</dd></div></dl><p class="preview-help">To reset your password, sign out after saving, then choose Forgot password? Open the newest reset email in the same browser. Email delivery must be available for your address. MFA setup is not available in this release.</p></section><p class="preview-help">The marketplace uses sample listings, messages and orders. Uploaded test data is saved to your workspace. Please use sample information during testing.</p></div>';
  }
  function fatal() { waiting('Watchify could not be opened.', 'Your saved cloud workspace has not been replaced. Reload this page or ask João to check the test environment.'); }
  root.WatchifyPreview = Object.freeze({ authenticate, restoreWorkspace, startSync, securityPage, fatal, assertActive: assertCurrentWorkspace });
})(globalThis);
